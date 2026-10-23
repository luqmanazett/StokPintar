import "dotenv/config";
import { createApp } from "./app";

const port = Number(process.env.PORT ?? 3000);
if (require.main === module) {
  createApp().listen(port, () => console.log(`Server jalan di http://localhost:${port}`));
}
