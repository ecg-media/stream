#!/bin/bash
# Double-click this file on a Mac to update the stream server to the newest version.
cd "$(dirname "$0")" || exit 1
bash ./install.sh --update
echo
read -r -p "Zum Schließen die Eingabetaste drücken …"
