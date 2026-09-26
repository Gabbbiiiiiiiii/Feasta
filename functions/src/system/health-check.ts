import {onRequest} from "firebase-functions/v2/https";

export const healthCheck = onRequest(
  {
    region: "asia-southeast1",
  },
  (_request, response) => {
    response.status(200).json({
      service: "feasta-functions",
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  },
);