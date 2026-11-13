# Celtech Canteen — PHP + SQLite

Plain HTML/CSS/JavaScript frontend, PHP backend, and SQLite storage. The school
logo and green/gold interface are unchanged. Python, npm, Vite, and a virtual
environment are **not needed** to run this downloadable version.

## Windows / VS Code setup

1. Install PHP 8.2 or newer (XAMPP's PHP is also suitable).
2. In your active `php.ini`, enable `extension=pdo_sqlite` and `extension=gd`.
   Use `php --ini` to locate the configuration file. `php -m` should list
   `PDO`, `pdo_sqlite`, and `gd`. GD must include JPEG, PNG, and WebP support
   for the corresponding photo formats.
3. Extract this ZIP and open the **Celtech-Canteen** folder in VS Code.
4. Open a PowerShell terminal in that folder. For a **new database**, set
   your first owner password (replace the placeholder; do not use it literally):

```powershell
$env:CELTECH_OWNER_PASSWORD = "YOUR-OWN-STRONG-PASSWORD"
php -S 127.0.0.1:8000 -t public router.php
```

If PHP is not on PATH and you use XAMPP:

```powershell
$env:CELTECH_OWNER_PASSWORD = "YOUR-OWN-STRONG-PASSWORD"
& "C:\xampp\php\php.exe" -S 127.0.0.1:8000 -t public router.php
```

5. Open **http://localhost:8000**. Log in as **Canteen owner** with username
   **merza** and the password you chose. Keep the terminal running; Ctrl+C stops it.
   On later runs with the same database, the password environment variable
   is not required. Setting it does not reset an existing password.

Do not double-click the HTML file or use Live Server. Do not start Apache
with the entire project folder as its document root: that exposes private files.
The command above exposes **only public/**.

## Preserve your existing Python-version data

Stop the old Python server first. Back up the entire `backend/data` folder
after stopping it, including any SQLite WAL/SHM files. Copy that folder into
this project's `backend/data` without overwriting it with an empty database.
Do **not** delete `backend/data/celtech.sqlite3`.

PHP uses the same database schema and PBKDF2 password-hashing parameters as
the Python version. Existing student and owner accounts, passwords, orders,
photos, stock, receipts, and activity remain usable. Your existing **merza**
password stays unchanged. This ZIP includes no database or preset password.
Keep the old installation as a backup until you confirm the migration.

## Features

- Student-number/password registration and login; no email.
- Student menu, ordering, pickup notices, purchase history, and printable receipts.
- Owner product/photo management, stock, student accounts, additional owners,
  orders, receipts, and activity logs.
- Pending → Ready → Collected; collection requires sufficient cash payment.
- Server calculates totals/change, reserves stock transactionally, and prevents
  duplicate orders with request IDs.
- Owner-only management APIs, hashed passwords, HTTP-only eight-hour sessions,
  login/registration throttling, and request-header protection.

Open **Owners** while logged in as an owner to create another owner account.
All owners have full management access; only add trusted staff. For simultaneous
student/owner testing, use separate browser profiles or an incognito window.
Pickup notices update by in-app polling every five seconds, not SMS or push.

## Reset an owner password

Run in the project folder:

```powershell
php backend/manage.php
```

Enter the username (Enter defaults to `merza`), then the new password twice.
Input is visible to avoid Windows hidden-input problems: use a private terminal,
not a screen share. Previous sessions for that owner are revoked.

## Verification

```powershell
php -l backend/core.php
php -l backend/api.php
php -l router.php
php backend/test.php
```

The regression check uses an isolated temporary database, never your real data.
Health endpoint: **http://localhost:8000/api/health**.

## Phone access and hosting

`localhost` works only on your computer. For trusted same-Wi-Fi testing, bind
to `0.0.0.0` instead of `127.0.0.1`, allow port 8000 in Windows Firewall, and
open `http://YOUR-PC-LAN-IP:8000` on the phone. HTTP is only for trusted testing.

For access anywhere over mobile data, you still need HTTPS hosting or a tunnel.
The ZIP does not create a public link automatically. PHP's built-in server is
development-only, not a production server. Production needs PHP 8.2+, PDO SQLite,
GD, a persistent writable private database directory, HTTPS, backups, and
`CELTECH_COOKIE_SECURE=true`. Configure the document root to `public/` and route
`/api/*` to `backend/api.php` using your web server configuration. Keep the
backend and database outside the public document root. Never publish SQLite files.
Static-only hosting cannot run this backend.

Student signup does not prove enrollment; add roster verification/approval before
real school use. Receipts are not tax invoices. External Google Fonts and default
food photos require internet access.

## Files and settings

- `public/index.html`, `public/src/app.js`, `public/src/styles.css`: frontend.
- `public/src/imports/OIP__1_.png`: official school logo.
- `router.php`: PHP development routing.
- `backend/core.php`, `backend/api.php`: API and persistence.
- `backend/manage.php`: password reset CLI.
- `backend/seed_products.json`: initial sample menu (20 units each).
- `backend/data/celtech.sqlite3`: saved database, created at setup.
- `backend/test.php`: isolated regression checks.

Environment variables: `CELTECH_DATABASE` overrides the database file path;
`CELTECH_OWNER_PASSWORD` initializes a new owner only;
`CELTECH_COOKIE_SECURE=true` requires HTTPS session cookies.
