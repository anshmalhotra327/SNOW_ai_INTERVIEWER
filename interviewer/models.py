import uuid
from django.db import models


class CandidateSession(models.Model):
    STATUS_CHOICES = [
        ("PROCESSING", "Processing"),
        ("READY", "Ready"),
        ("VERIFYING", "Verifying"),
        ("INTERVIEWING", "Interviewing"),
        ("COMPLETED", "Completed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    candidate_name = models.CharField(max_length=255, blank=True)
    resume_file = models.FileField(upload_to="resumes/")
    resume_text = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PROCESSING")
    overall_score = models.IntegerField(null=True, blank=True)
    strengths = models.TextField(blank=True)
    technical_accuracy = models.TextField(blank=True)
    feedback_summary = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Session {self.id} ({self.candidate_name or 'unnamed'})"


class InterviewQuestion(models.Model):
    session = models.ForeignKey(
        CandidateSession, related_name="questions", on_delete=models.CASCADE
    )
    order = models.PositiveIntegerField()
    question_text = models.TextField()
    question_type = models.CharField(max_length=50, blank=True)
    answer_text = models.TextField(blank=True)

    class Meta:
        ordering = ["order"]
        unique_together = ("session", "order")

    def __str__(self):
        return f"Q{self.order} for {self.session_id}"
