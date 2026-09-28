/**
 * Make a sign-in link without sending any mail.
 *
 * Asked for because the send is capped at five a day for the whole project and testing is the
 * activity that spends them fastest: a mistyped address spends one, a link that never arrives
 * spends one, and a link opened on a second laptop spends another. Generating a link is a
 * different operation with a different limit, 20,000 a day, and it puts no mail in the post at
 * all. So this hands back the link as text and somebody sends it however they like.
 *
 * What that buys beyond the quota: a link pasted into an ordinary message from a government
 * mailbox to a government mailbox is the delivery profile least likely to be stopped, where the
 * one Firebase sends leaves as noreply at a firebaseapp.com address with no sender name.
 *
 * WHAT IT NEEDS. A service account key, which is a file that can act as the project. It is a
 * credential, the repository is public, and a key committed by accident cannot be un-published.
 * So this refuses to read one from inside the repository, and the path comes from the
 * environment with no default that could be guessed wrong:
 *
 *   EARB_SERVICE_ACCOUNT=~/earb-key.json node deploy/make-signin-link.mjs someone@tbs-sct.gc.ca
 *
 * To make the key: Google Cloud console, IAM and admin, Service accounts,
 * firebase-adminsdk-fbsvc@tbs-earb-self-assessment, Keys, Add key, JSON. Keep it outside this
 * folder. Delete it from the console when the testing is done.
 */
import { readFile } from 'node:fs/promises';
import { createSign } from 'node:crypto';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

// fileURLToPath and not the URL's pathname: this folder's name has spaces in it, and a pathname
// hands them back percent-encoded, so the comparison below silently never matched.
const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));
const IDENTITY = 'https://identitytoolkit.googleapis.com/v1';

/** Where the link should bring somebody back to. The assessor page, because that is the door. */
const RETURN_TO = process.env.EARB_RETURN_TO
  ?? 'https://myermcat.github.io/tbs-earb-self-assessment-preview/assessor/';

const die = (why) => { console.error(`\n${why}\n`); process.exit(1); };

const email = process.argv[2];
if (!email || !email.includes('@')) {
  die('Give the address the link is for:\n'
    + '  EARB_SERVICE_ACCOUNT=~/earb-key.json node deploy/make-signin-link.mjs you@tbs-sct.gc.ca');
}

const keyPath = process.env.EARB_SERVICE_ACCOUNT?.replace(/^~/, homedir());
if (!keyPath) die('EARB_SERVICE_ACCOUNT is not set. It is the path to the service account key.');
if (resolve(keyPath).startsWith(REPO)) {
  die(`That key is inside the repository, at\n  ${resolve(keyPath)}\n\n`
    + 'This repository is public and a key committed by accident cannot be un-published.\n'
    + 'Move it somewhere else, such as your home folder, and point EARB_SERVICE_ACCOUNT there.');
}

const key = JSON.parse(await readFile(keyPath, 'utf8'));
for (const field of ['client_email', 'private_key', 'project_id']) {
  if (!key[field]) die(`That file is not a service account key: it has no ${field}.`);
}

/**
 * A token to act as the project.
 *
 * returnOobLink is not a thing an API key may ask for, which is the whole reason a service
 * account is involved: an API key sits in the published page, and anybody holding one that
 * could mint sign-in links could mint one for any address, including an assessor's.
 */
const now = Math.floor(Date.now() / 1000);
const claim = {
  iss: key.client_email,
  scope: 'https://www.googleapis.com/auth/cloud-platform',
  aud: 'https://oauth2.googleapis.com/token',
  iat: now,
  exp: now + 3600,
};
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const body = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claim)}`;
const signer = createSign('RSA-SHA256');
signer.update(body);
const assertion = `${body}.${signer.sign(key.private_key, 'base64url')}`;

const tokenReply = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  }),
});
const tokenBody = await tokenReply.json();
if (!tokenReply.ok) die(`The key was refused: ${JSON.stringify(tokenBody)}`);

/**
 * returnOobLink is what makes this free. Without it the same call sends the mail and spends one
 * of the five; with it the service hands the link back and posts nothing.
 */
const reply = await fetch(`${IDENTITY}/projects/${key.project_id}/accounts:sendOobCode`, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${tokenBody.access_token}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    requestType: 'EMAIL_SIGNIN',
    email,
    continueUrl: RETURN_TO,
    canHandleCodeInApp: true,
    returnOobLink: true,
  }),
});
const made = await reply.json();
if (!reply.ok) die(`The service refused: ${JSON.stringify(made, null, 2)}`);
if (!made.oobLink) die(`No link came back:\n${JSON.stringify(made, null, 2)}`);

console.log(`
A sign-in link for ${email}. Nothing has been sent and the daily five is untouched.

${made.oobLink}

Paste it into an ordinary message from your own mail to that address, and open it there.
It works once, and for six hours.
`);
