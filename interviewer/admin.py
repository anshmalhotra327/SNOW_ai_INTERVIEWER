from django.contrib import admin
from .models import CandidateSession, InterviewQuestion


class InterviewQuestionInline(admin.TabularInline):
    model = InterviewQuestion
    extra = 0


@admin.register(CandidateSession)
class CandidateSessionAdmin(admin.ModelAdmin):
    list_display = ["id", "candidate_name", "status", "overall_score", "created_at"]
    inlines = [InterviewQuestionInline]


@admin.register(InterviewQuestion)
class InterviewQuestionAdmin(admin.ModelAdmin):
    list_display = ["session", "order", "question_type"]
