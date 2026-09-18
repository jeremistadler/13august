(() => {
  const form = document.querySelector('.signup');
  const field = name => document.getElementById(`signup-${name}`);
  const interest = field('interest');
  const details = field('details');
  const confirmation = field('confirmation');
  const send = field('send');
  const status = field('status');
  const cancel = field('cancel');
  let saved = null;
  let sitekey = '';
  let busy = false;
  let editing = false;
  let widget;
  let turnstileScript;
  let pendingChallenge;

  function foodChoice() {
    const checked = field('food').checked;
    const locked = Boolean(saved) && !editing;
    field('food-details').hidden = !checked;
    field('food').setAttribute('aria-expanded', String(checked));
    field('food').disabled = busy || locked;
    field('food-note').disabled = busy || locked || !checked;
    field('food-note').required = checked;
    field('food-edit').hidden = !locked;
    field('food-send').hidden = locked;
    field('food-send').disabled = busy || locked;
    field('food-status').textContent = locked
      ? 'Ditt val är sparat med din anmälan. Välj Ändra svar om du vill ändra det.'
      : status.textContent || 'Ditt val sparas i samma anmälan när du trycker på Skicka svar.';
  }

  function bedNote() {
    field('bed-note').hidden = !field('bed').checked;
    field('bed-dates').hidden = !field('bed').checked;
    field('bed-stay').disabled = !field('bed').checked || busy;
    field('bed-stay').required = field('bed').checked;
    field('bed').setAttribute('aria-expanded', String(field('bed').checked));
  }

  function expand() {
    // Allow existing respondents to uncheck attendance and submit an update.
    const expanded = interest.checked || editing;
    details.hidden = !expanded;
    interest.setAttribute('aria-expanded', String(expanded));
  }

  function fill(answers) {
    interest.checked = answers.interest;
    field('bed').checked = answers.bed;
    field('bed-stay').value = answers.bedStay || '';
    field('food').checked = answers.bringsFood === true;
    field('food-note').value = answers.foodNote || '';
    foodChoice();
    bedNote();
    for (const name of ['name', 'companions', 'comment', 'phone']) field(name).value = answers[name] || '';
  }

  function showConfirmation(focus = true) {
    editing = false;
    form.hidden = true;
    confirmation.hidden = false;
    foodChoice();
    if (focus) confirmation.focus();
  }

  async function api(options = {}) {
    const response = await fetch('/api/rsvp', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(20000), ...options });
    let data;
    try { data = await response.json(); } catch { throw new Error('Anmälan är inte tillgänglig just nu. Försök igen senare.'); }
    if (!response.ok) throw new Error(data.error || 'Svaret kunde inte skickas. Försök igen.');
    return data;
  }

  async function initialize() {
    const data = await api();
    sitekey = data.sitekey;
    saved = data.answers;
    if (saved) { fill(saved); showConfirmation(false); }
    send.disabled = false;
    status.textContent = '';
  }

  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve();
    if (turnstileScript) return turnstileScript;
    turnstileScript = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => { script.remove(); turnstileScript = null; reject(new Error('Spamkontrollen kunde inte laddas. Försök igen.')); }, 15000);
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = () => { clearTimeout(timer); script.remove(); turnstileScript = null; reject(new Error('Spamkontrollen kunde inte laddas. Försök igen.')); };
      document.head.append(script);
    });
    return turnstileScript;
  }

  async function verify() {
    await loadTurnstile();
    if (widget === undefined) {
      // Production sitekeys must belong to an Invisible-mode widget.
      widget = window.turnstile.render('#signup-turnstile', {
        sitekey, action: 'rsvp', execution: 'execute', 'response-field': false,
        callback: token => pendingChallenge?.resolve(token),
        'error-callback': () => { pendingChallenge?.reject(new Error('Spamkontrollen misslyckades. Försök igen.')); return true; },
        'expired-callback': () => pendingChallenge?.reject(new Error('Spamkontrollen har gått ut. Försök igen.')),
      });
    } else window.turnstile.reset(widget);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(reject, new Error('Spamkontrollen tog för lång tid. Försök igen.')), 30000);
      function finish(callback, value) { clearTimeout(timer); pendingChallenge = null; callback(value); }
      pendingChallenge = { resolve: value => finish(resolve, value), reject: error => finish(reject, error) };
      window.turnstile.execute(widget);
    });
  }

  interest.addEventListener('change', expand);
  field('name').addEventListener('input', () => {
    if (field('name').value.trim()) {
      interest.checked = true;
      expand();
    }
  });
  field('bed').addEventListener('change', bedNote);
  field('food').addEventListener('change', foodChoice);
  function editResponse() {
    editing = true;
    fill(saved);
    confirmation.hidden = true;
    form.hidden = false;
    cancel.hidden = false;
    send.textContent = 'Skicka ändrat svar';
    status.textContent = '';
    expand();
    interest.focus();
    foodChoice();
  }
  field('edit').addEventListener('click', editResponse);
  field('food-edit').addEventListener('click', () => { editResponse(); field('food').focus(); });
  field('food-send').addEventListener('click', event => {
    if (!interest.checked && !editing) {
      event.preventDefault();
      field('food-status').textContent = 'Kryssa i Jag kommer och fyll i ditt namn högst upp innan du skickar.';
      interest.focus();
    }
  });
  cancel.addEventListener('click', () => { fill(saved); showConfirmation(); });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || (!interest.checked && !editing)) return;
    busy = true;
    const controls = [...form.querySelectorAll('input, textarea, select, button'), field('food'), field('food-note'), field('food-send')];
    controls.forEach(control => { control.disabled = true; });
    status.textContent = 'Skickar ditt svar…';
    foodChoice();
    try {
      if (!sitekey) {
        await initialize();
        send.disabled = true;
        if (saved) return;
      }
      const turnstileToken = await verify();
      const answers = { name: field('name').value, interest: interest.checked, bed: field('bed').checked, bedStay: field('bed').checked ? field('bed-stay').value : '', companions: field('companions').value, comment: field('comment').value, phone: field('phone').value };
      answers.bringsFood = field('food').checked;
      answers.foodNote = answers.bringsFood ? field('food-note').value : '';
      const data = await api({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...answers, turnstileToken }) });
      if (data.submitted !== true || !data.answers) throw new Error('Svaret kunde inte bekräftas. Försök igen.');
      saved = data.answers;
      status.textContent = '';
      showConfirmation();
    } catch (error) {
      status.textContent = error.name === 'TimeoutError' ? 'Anslutningen tog för lång tid. Försök igen.' : error.message;
    } finally {
      busy = false;
      controls.forEach(control => { control.disabled = false; });
      bedNote();
      foodChoice();
    }
  });

  expand();
  bedNote();
  foodChoice();
  initialize().catch(() => {
    status.textContent = 'Anmälan kunde inte laddas. Du kan fylla i dina uppgifter och försöka skicka igen.';
    send.disabled = false;
  });
})();
