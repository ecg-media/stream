#!/bin/bash
# Double-click this file on a Mac to install or update the stream server.
cd "$(dirname "$0")" || exit 1
bash ./install.sh "$@"
echo
read -r -p "Zum Schließen die Eingabetaste drücken …"
