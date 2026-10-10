try:
    from app.api.routes import router
    from app.main import app
    print("Imports passed")
except Exception as e:
    import traceback
    traceback.print_exc()
