/// <reference path="../pb_data/types.d.ts" />

/*
 * SNMC Law Legal Clinic: Cloudflare Turnstile check for online bookings (PocketBase JS hook).
 *
 * The public booking form (index.html) sends the security-check token as `turnstile_token` with each new
 * `appointments` record. This asks Cloudflare whether the token is genuine before PocketBase saves it,
 * so bots can't skip the check by posting to the API directly.
 *
 * Install on the PocketBase server (README → "Spam protection"):
 *   1. Copy this file into the `pb_hooks` folder next to `pb_data` (create the folder if needed).
 *   2. Set the environment variable TURNSTILE_SECRET to the widget's SECRET key, then restart PocketBase.
 * Until TURNSTILE_SECRET is set, bookings are let through and a warning is logged.
 * Signed-in staff (walk-ins added on the dashboard) never need the check.
 */
onRecordCreateRequest((e) => {
  if (e.auth) {
    e.next();
    return;
  }

  const secret = $os.getenv("TURNSTILE_SECRET");
  if (!secret) {
    console.warn("[turnstile] TURNSTILE_SECRET is not set: online bookings are NOT being checked.");
    e.next();
    return;
  }

  const body = e.requestInfo().body || {};
  const token = String(body["turnstile_token"] || "");
  if (!token) {
    throw new BadRequestError("Security check missing. Please complete it and try again.");
  }

  let ok = false;
  try {
    const res = $http.send({
      url: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "secret=" + encodeURIComponent(secret) +
        "&response=" + encodeURIComponent(token) +
        "&remoteip=" + encodeURIComponent(e.realIP()),
      timeout: 10, // seconds
    });
    let data = res.json;
    if (!data) {
      try { data = JSON.parse(toString(res.body)); } catch (_) { data = null; }
    }
    ok = res.statusCode === 200 && !!data && data.success === true;
    if (!ok) console.warn("[turnstile] booking rejected:", JSON.stringify(data));
  } catch (err) {
    console.error("[turnstile] could not reach Cloudflare:", err);
  }

  if (!ok) {
    throw new BadRequestError("Security check failed. Please complete it again and resubmit.");
  }
  e.next();
}, "appointments");
