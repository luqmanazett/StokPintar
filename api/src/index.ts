import "dotenv/config";
import { createApp } from "./app";
import { startDailyDemoResetScheduler } from "./services/demo-reset-scheduler";

const port = Number(process.env.PORT ?? 3000);
if (require.main === module) {
  startDailyDemoResetScheduler();
  createApp().listen(port, () => console.log(`Server jalan di http://localhost:${port}`));
}
