import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  name: "svgEditor",
  type: "server",
  server: {
    port: 3000,
    name: "svgEditor_server",
    routers: path.join(__dirname, "server/routers.mjs"),
    pathViews: path.join(__dirname, "server/views"),
    pathPublic: path.join(__dirname, "server/public"),
    watchFile: true,
  },
  preload: path.join(__dirname, "preload.mjs"),
  sqlite3: [],
};
