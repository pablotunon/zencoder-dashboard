from fastapi import FastAPI

app = FastAPI(title="AgentHub Analytics API")


@app.get("/api/health")
async def health():
    return {"status": "ok", "message": "Analytics API stub - Phase 0"}
