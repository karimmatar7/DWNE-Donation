import ngrok from "ngrok";

(async function () {
  try {
    const url = await ngrok.connect({ addr: 3000 });
    console.log(`🚀 Ngrok tunnel running at: ${url}`);
  } catch (err) {
    console.error("⚠️ Could not start ngrok tunnel:", err.message);
    console.error("👉 Run: ngrok config add-authtoken YOUR_TOKEN");
  }
})();
