## Environnements (Angular + Firebase)

Copiez les fichiers d’exemple **non sensibles** vers les fichiers réels **non versionnés** :

```bash
cp src/environments/environment.example.ts src/environments/environment.ts
cp src/environments/environment.prod.example.ts src/environments/environment.prod.ts
```

Puis remplissez vos valeurs Firebase (`apiKey`, `authDomain`, `projectId`, `databaseURL`, etc.).  
Les fichiers `environment.ts` et `environment.prod.ts` sont **ignorés par Git** via `.gitignore`.

### Astuce (hooks Git)
Un hook local empêche par erreur de commiter vos fichiers d’environnement :

```bash
git config core.hooksPath .githooks
```

Cela activera le hook `pre-commit` fourni dans ce repo.
