from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from .models import CandidateSession, InterviewQuestion
from .serializers import CandidateSessionSerializer
from . import services


@api_view(["POST"])
def upload_resume(request):
    resume_file = request.FILES.get("resume")
    if not resume_file:
        return Response({"error": "No resume file provided."}, status=status.HTTP_400_BAD_REQUEST)

    session = CandidateSession.objects.create(resume_file=resume_file, status="PROCESSING")

    try:
        resume_text = services.extract_resume_text(session.resume_file.path)
        if not resume_text:
            raise ValueError("Could not extract any text from the uploaded PDF.")
        session.resume_text = resume_text

        questions = services.generate_interview_questions(resume_text)
        InterviewQuestion.objects.bulk_create(
            [
                InterviewQuestion(
                    session=session,
                    order=q["order"],
                    question_text=q["question"],
                    question_type=q.get("type", ""),
                )
                for q in questions
            ]
        )
        session.status = "READY"
        session.save()
    except Exception as exc:
        session.status = "PROCESSING"
        session.save()
        return Response(
            {"error": f"Failed to process resume: {exc}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return Response(
        {
            "session_id": str(session.id),
            "status": session.status,
            "questions": [
                {"order": q.order, "question": q.question_text, "type": q.question_type}
                for q in session.questions.all()
            ],
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
def verify_trigger(request):
    spoken_text = request.data.get("spoken_text", "")
    name = services.verify_trigger_phrase(spoken_text)
    if name:
        return Response({"verified": True, "candidate_name": name})
    return Response({"verified": False})


@api_view(["POST"])
def submit_interview(request):
    session_id = request.data.get("session_id")
    candidate_name = request.data.get("candidate_name", "")
    answers = request.data.get("answers", [])

    session = get_object_or_404(CandidateSession, id=session_id)
    session.candidate_name = candidate_name

    answer_map = {a["order"]: a.get("answer", "") for a in answers}
    for question in session.questions.all():
        question.answer_text = answer_map.get(question.order, "")
        question.save()

    qa_pairs = [
        {"order": q.order, "question": q.question_text, "answer": q.answer_text}
        for q in session.questions.all()
    ]

    try:
        evaluation = services.evaluate_interview(candidate_name, qa_pairs)
        session.overall_score = evaluation.get("overall_score")
        session.strengths = evaluation.get("strengths", "")
        session.technical_accuracy = evaluation.get("technical_accuracy", "")
        session.feedback_summary = evaluation.get("feedback_summary", "")
        session.status = "COMPLETED"
        session.save()
    except Exception as exc:
        return Response(
            {"error": f"Failed to evaluate interview: {exc}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return Response(CandidateSessionSerializer(session).data)


@api_view(["GET"])
def session_results(request, session_id):
    session = get_object_or_404(CandidateSession, id=session_id)
    return Response(CandidateSessionSerializer(session).data)
