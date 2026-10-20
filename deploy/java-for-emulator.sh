#!/usr/bin/env bash
# Runs its arguments with a Java the Firestore emulator will accept.
#
#   bash deploy/java-for-emulator.sh firebase emulators:exec ...
#
# WHY THIS EXISTS. firebase-tools refuses any Java before 21, and the Java on this machine's
# PATH is 18. `npm run test:rules` therefore stopped with "firebase-tools no longer supports
# Java version before 21" and never reached a single check, which reads at a glance like the
# rules suite failing. It is Java, and it has nothing to do with the rules.
#
# EVERY CANDIDATE IS ASKED ITS VERSION, including the one that looks authoritative. The first
# version of this file trusted `/usr/libexec/java_home -v 21+`, which does not mean "21 or
# above": asked on a machine whose newest JDK is 18, it exits 0 and prints the path to 18. The
# wrapper then set JAVA_HOME to a Java too old to run and handed back the same error it was
# written to prevent.
set -euo pipefail

# The major version a JDK at this path reports, or nothing.
major_of() {
  [ -x "$1/bin/java" ] || return 0
  "$1/bin/java" -version 2>&1 | head -1 | sed -n 's/.*version "\([0-9][0-9]*\).*/\1/p'
}

pick() {
  for home in "${JAVA_HOME:-}" \
              "$(/usr/libexec/java_home 2>/dev/null || true)" \
              /opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home \
              /usr/local/opt/openjdk/libexec/openjdk.jdk/Contents/Home; do
    [ -n "$home" ] || continue
    v="$(major_of "$home")"
    if [ -n "$v" ] && [ "$v" -ge 21 ]; then echo "$home"; return 0; fi
  done
  return 1
}

if ! JAVA_HOME="$(pick)"; then
  echo "The Firestore emulator needs Java 21 or above, and none was found." >&2
  echo "Install one: brew install openjdk" >&2
  exit 1
fi
export JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH"
exec "$@"
