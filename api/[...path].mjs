import { createVercelHandler } from '../server/vercel-handler.mjs';

export const config = {
  maxDuration: 60,
  api: { bodyParser: false },
};

// Built once per isolate so the in-process limiter has something to remember.
export default createVercelHandler();
