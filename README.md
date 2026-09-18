# Arbetsdag & fest

Statisk inbjudan med Cloudflare Workers, D1 och osynlig Turnstile för anmälningar.

## Lokalt

```sh
npm install
npm run dev
```

Öppna `http://127.0.0.1:8787`. Utvecklingsservern använder en lokal D1-databas och Cloudflares officiella osynliga testwidget. Lokala testnycklar väljs endast för loopback-värdnamn; en driftsatt Worker kräver riktiga nycklar.

```sh
npm run build
```

Efter ändringar i HTML eller klientskript: kör `npm run build` och ladda om sidan. Backend-koden laddas om av Wrangler.

## Anmälningar

`GET /api/rsvp` skapar eller återanvänder en slumpmässig, HttpOnly-skyddad cookie och läser endast den besökarens svar. `PUT /api/rsvp` kontrollerar ursprung, storlek, indata och Turnstile hos Cloudflare innan svaret sparas. Samma cookie uppdaterar samma databasrad, även efter ett nätverksfel och nytt försök. Databasen lagrar en hash av sessionsnyckeln.

Formuläret visar bekräftelse först efter att backend har bekräftat sparandet. Vid återbesök hämtas svaret från databasen. ”Ändra svar” öppnar tidigare uppgifter och uppdaterar samma anmälan. Gamla, enbart lokalt sparade utkast räknas inte som inskickade svar.

Cookies identifierar webbläsaren, inte en fysisk person. Rensade cookies eller en annan webbläsare kan ge en ny anmälan. Svar skickas inte som e-post eller SMS. Arrangören kan se alla svar på `/admin`. Sidan skyddas med HTTP Basic-inloggning som kontrolleras i Workern innan någon information hämtas. Användarnamn och lösenord lagras som Cloudflare-hemligheterna `ADMIN_USERNAME` och `ADMIN_PASSWORD`, aldrig i klientkod eller Git. Lokalt läggs de i den ignorerade filen `.dev.vars`. Adminsvar får inte cachas eller indexeras och inskickad text HTML-escapas. Ingen databasändring krävs för adminvyn.

## Cloudflare

`main` är huvudgren. Cloudflare Workers Builds bygger automatiskt vid push till `main` i `jeremistadler/13august`. Byggkommandot är `npm run build`; publiceringskommandot är `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy`. Migrationer körs före publicering, och ett misslyckat steg avbryter körningen. Övriga grenar publiceras inte av denna koppling. Hemligheter finns kvar i Cloudflare och ska inte checkas in.

Konfigurationen använder Jeremis personliga Cloudflare-konto. Både `https://www.13augusti.se` och `https://13augusti.se` går till den nya webbplatsen genom Worker-routes i `wrangler.jsonc`. Allt innehåll och API hanteras av Workern och Workers Static Assets. DNS-posterna för både roten och `www` är proxade A-poster till `192.0.2.0` (TTL Auto), Cloudflares reserverade adress för drift utan ursprungsserver. Worker-routes tar hand om alla anrop; inga DNS-poster pekar på GitHub Pages. Behåll posterna proxade och båda Worker-routes aktiva. `https://arbetsdag-fest.jeremi.workers.dev` finns också kvar.

Databasmigrationerna finns i `migrations/`. Alla måste köras innan den här versionen driftsätts:

```sh
npx wrangler d1 migrations apply DB --remote
npm run deploy
```

Turnstile-widgeten måste använda läget **Invisible** och tillåta webbplatsens värdnamn. Den publika nyckeln finns i `wrangler.jsonc`; hemligheten är en Worker-secret, `TURNSTILE_SECRET_KEY`. Lägg aldrig hemligheten i klientkod eller Git.

```sh
npx wrangler secret put TURNSTILE_SECRET_KEY
```

Integritetsinformationen i `privacy.html` beskriver lagring och länkar till Cloudflares Turnstile Privacy Addendum. Vid byte av domän behöver både widgetens tillåtna värdnamn och hosting konfigureras. Frontend och API ska ligga på samma ursprung.

## Kontroll inför publicering

Projektet innehåller inga automatiska tester, enligt önskemål. Kör bygget och kontrollera formulär, responsiv layout och admininloggning före publicering. Kontrollera att `/admin` utan rätt inloggning inte lämnar ut uppgifter.

Produktionsflödet verifierades 2026-09-18: osynlig Turnstile, inskickning, sparad bekräftelse efter omladdning samt skyddad admininloggning. Båda domänerna levererar de byggda filerna från Cloudflare. GitHub avvisar avaktivering av den äldre Pages-webbplatsen (HTTP 422), men domänens DNS använder den inte längre.

Officiell dokumentation:
- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/d1/worker-api/prepared-statements/
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- https://developers.cloudflare.com/turnstile/troubleshooting/testing/
