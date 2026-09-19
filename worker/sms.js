const recipients = ['+46765699961', '+46727131477'];

function short(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  const characters = Array.from(text);
  return characters.length > 60 ? `${characters.slice(0, 57).join('')}...` : text;
}

export function summary(answers) {
  const nights = { 'fri-sat': 'fre-lör', 'sat-sun': 'lör-sön', 'fri-sun': 'fre-sön' };
  return [
    `Ny anmälan: ${short(answers.name)}`,
    `Kommer: ${answers.interest ? 'Ja' : 'Nej'}`,
    `Medföljande: ${short(answers.companions) || '-'}`,
    `Telefon: ${short(answers.phone) || '-'}`,
    `Sängplats: ${answers.bed ? 'Ja' : 'Nej'}`,
    answers.bed && `Nätter: ${nights[answers.bedStay] || '-'}`,
    `Tar med mat: ${answers.bringsFood ? 'Ja' : 'Nej'}`,
    answers.bringsFood && `Mat: ${short(answers.foodNote) || '-'}`,
    `Kommentar: ${short(answers.comment) || '-'}`,
    'Alla svar: https://www.13augusti.se/admin',
  ].filter(Boolean).join('\n');
}

export async function notifyNewSubmission(env, answers) {
  if (!env.ELK_USERNAME || !env.ELK_PASSWORD) {
    console.error(JSON.stringify({ event: 'sms_configuration_missing' }));
    return;
  }
  await Promise.all(recipients.map(async (to, recipientIndex) => {
    try {
      const response = await fetch('https://api.46elks.com/a1/sms', {
        method: 'POST',
        headers: { Authorization: `Basic ${btoa(`${env.ELK_USERNAME}:${env.ELK_PASSWORD}`)}` },
        body: new URLSearchParams({ from: 'FEST', to, message: summary(answers), dontlog: 'message' }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        console.error(JSON.stringify({ event: 'sms_rejected', recipientIndex, status: response.status }));
        await response.body?.cancel();
        return;
      }
      const result = await response.json();
      console.log(JSON.stringify({ event: 'sms_accepted', recipientIndex, id: result.id, status: result.status }));
    } catch {
      console.error(JSON.stringify({ event: 'sms_request_failed', recipientIndex }));
    }
  }));
}
