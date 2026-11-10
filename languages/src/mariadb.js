// languages/src/mariadb.js -- the source of languages/mariadb.js (built by
// languages/build.mjs): SQL in the MariaDB dialect, for the database window's
// command line (D-db-session; code_cmd_in ?lang=mariadb).
//   npm i esbuild @codemirror/lang-sql@6.10.0
// @codemirror/lang-sql is MIT (CodeMirror, lib/vendor/codemirror/LICENSE).
import { sql, MariaSQL } from '@codemirror/lang-sql';

export default () => sql({ dialect: MariaSQL });
