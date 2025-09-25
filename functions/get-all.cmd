@echo off
setlocal enabledelayedexpansion
echo === Lancement des snapshots ===
call npm run get:lobby || goto :err
call npm run get:room || goto :err
call npm run get:play || goto :err
call npm run get:score || goto :err
call npm run get:script || goto :err
call npm run get:functions || goto :err
echo === Terminé avec succès ===
exit /b 0
:err
echo *** Erreur: commande échouée. ***
exit /b 1