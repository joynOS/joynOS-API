from fastapi import FastAPI
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from app.routes.auth.auth_routers import auth_router
from app.routes.user.user_routers import user_router
from app.routes.quiz.quiz_routers import quiz_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(user_router)
app.include_router(quiz_router)


@app.get("/", response_class=HTMLResponse)
async def read_root():
    return """
    <html>
        <head>
            <title>Bem-vindo</title>
        </head>
        <body>
            <h1>Bem-vindo à API JoynOS!</h1>
            <p>Confira a documentação da API <a href="/docs">aqui</a>.</p>
        </body>
    </html>
    """
