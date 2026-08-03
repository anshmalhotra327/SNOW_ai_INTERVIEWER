from django.urls import path
from . import views

urlpatterns = [
    path("upload-resume/", views.upload_resume, name="upload-resume"),
    path("verify-trigger/", views.verify_trigger, name="verify-trigger"),
    path("submit-interview/", views.submit_interview, name="submit-interview"),
    path("session-results/<uuid:session_id>/", views.session_results, name="session-results"),
]
