/**
 * GPS Tracking | خادم Node.js بسيط لعرض الملفات المحلية فقط.
 * لا توجد واجهات API أو قاعدة بيانات أو مصادقة خارجية في هذه النسخة الاستعراضية.
 */
const express = require("express");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(port, () => {
  console.log(`GPS Tracking is running at http://localhost:${port}`);
});
