# PHP backend

See the project README for Windows setup, migration, hosting, and security.
PHP 8.2+, PDO SQLite, and GD are required. Start from the project folder:

```sh
php -S 127.0.0.1:8000 -t public router.php
```

Keep this directory outside the web document root. Data defaults to
`backend/data/celtech.sqlite3`; never delete or publish that file.
