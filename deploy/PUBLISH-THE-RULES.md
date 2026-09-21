# Publishing the Firestore rules

    bash deploy/publish-rules.sh

That is the whole of it. It sends `deploy/firestore.rules` to Google straight from the file and
then checks the published result from outside with no sign-in.

**Once, on a machine that has never done this:**

    npm install -g firebase-tools
    firebase login

The login opens a browser and is Mariia's to do. Nothing in the script asks for a password.

## Do not paste the rules into the console

The console route is below, and it is the fallback, not the way. It crosses the machine's
clipboard, which every window and every Claude session shares.

On 21 September 2026 a paste put a single line of unrelated text into the rules editor: the
clipboard had been overwritten between the copy and the paste by something else running on the
machine. It was caught because the editor showed one line where two hundred and sixty were
expected, and Discard was pressed rather than Publish. Publishing it would have replaced every
access rule in the store with one broken line.

If the console is the only way available, check two things before pressing Publish: that the
editor holds hundreds of lines and not one, and that the first line reads
`// The store, with sign-in, for the prototype.`

## The console, as a fallback

## Where the button is

1. Open **https://console.firebase.google.com/project/tbs-earb-self-assessment/firestore/rules** and sign in. That link goes straight to the editor; if it does not work, the steps below get you there by hand.
2. Click the project. It is called **tbs-earb-self-assessment**.
3. In the left sidebar, find **Build** and click it to expand it. Under Build, click
   **Firestore Database**.
4. The page that opens has a row of tabs across the **top of the main panel**, not in the
   sidebar and not in the header: **Data · Rules · Indexes · Usage**. Click **Rules**.
5. You are now looking at an editor holding the rules that are live right now.

If there is no Rules tab, the database has not been created yet. There will be a **Create
database** button instead: choose **northamerica-northeast1 (Montreal)** and then come back to
step 4. The region cannot be changed afterwards.

## What to paste

The whole of **`deploy/firestore.rules`**, from the repository, starting at the very first
line. It is a file in this folder, next to this one. On this machine it is at:

    /Users/maryy/Desktop/Claude Hub/Claude -- TBS/TBS fall/deploy/firestore.rules

Open it in any text editor, select all, copy. In the Firebase editor: select all, paste over
it, press **Publish**. It takes a few seconds and says so.

## Checking it worked

From a terminal:

    bash "/Users/maryy/Desktop/Claude Hub/Claude -- TBS/TBS fall/deploy/check-rules.sh"

It makes six requests with no sign-in at all and prints what happened to each. What you want:

    refused  list every assessment
    refused  list with a page size
    refused  read the roles
    refused  create an assessment
    refused  make yourself an admin
    opens    open one by its code  (NOT_FOUND)

Five refusals and one `opens` is the correct shape. **The `opens` line is the point**: a
stranger may open the one assessment whose twelve characters they were sent, and may never ask
what else is in there. `NOT_FOUND` is the right answer for a code nobody holds: the rule let
the request through and there was nothing behind it.

If the last line says `CLOSED` instead, the paste did not take. If any of the first five says
`OPEN`, stop and read which one before anybody else uses the tool.
