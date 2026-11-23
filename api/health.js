
export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "GET") {
        return res.status(405).json({
            success: false,
            message: "Method not allowed"
        });
    }

    return res.status(200).json({
        success: true,
        application: "StudyMind AI",
        status: "online",
        version: "1.0.0",
        services: {
            backend: "active",
            ai: "not configured yet",
            rag: "not configured yet",
            database: "not checked"
        },
        timestamp: new Date().toISOString()
    });
}
