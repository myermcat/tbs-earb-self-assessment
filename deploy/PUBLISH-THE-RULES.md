# Publishing the Firestore rules

The access code does nothing until this is done. The tool mints it, shows it, lets somebody
type it, and Google refuses the request, because the published rules still say an assessment
can only be read by its owner or an assessor.

This takes about two minutes and it is all in a web page. Nothing has to be installed.

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
