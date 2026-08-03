from rest_framework import serializers
from .models import CandidateSession, InterviewQuestion


class InterviewQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = InterviewQuestion
        fields = ["order", "question_text", "question_type", "answer_text"]


class CandidateSessionSerializer(serializers.ModelSerializer):
    questions = InterviewQuestionSerializer(many=True, read_only=True)

    class Meta:
        model = CandidateSession
        fields = [
            "id",
            "candidate_name",
            "status",
            "overall_score",
            "strengths",
            "technical_accuracy",
            "feedback_summary",
            "questions",
        ]
