### UNIQUEMENT COMPATIBLE WINDOWS !

#### Comment push une nouvelle version ?

		* `git add .`
		* `git commit -m "message"`
		* `git tag v<version_name>`
		* `git push && git push --tags`
		
	Le github action fera le reste. Une fois l'action terminée, elle sera en Draft dans les Releases, pensez donc à la publier
