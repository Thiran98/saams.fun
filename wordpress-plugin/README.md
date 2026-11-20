# WordPress plugin (Phase 5)

Empty for now. In Phase 5 this folder gets a small WordPress plugin that:

- adds a **Play** page for logged-in players (reusing the existing WordPress accounts),
- creates short-lived signed **match tickets** so the game server knows who is connecting (no passwords shared),
- receives match results from the game server and keeps **stats and leaderboards** in the WordPress database.

Secret keys go in `wp-config.php` and on the game server only, never in browser code.
