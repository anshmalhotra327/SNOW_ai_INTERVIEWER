const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
const synth = window.speechSynthesis;

const State = {
  IDLE: "IDLE",
  VERIFYING: "VERIFYING",
  INTERVIEWING: "INTERVIEWING",
  COMPLETED: "COMPLETED",
};

let currentState = State.IDLE;
let sessionId = null;
let questions = [];
let candidateName = "";
let currentQuestionIndex = 0;
let answers = [];
let recognition = null;
let introStarted = false;

const GREETING_LINES = [
  "It's great to have you here today.",
  "I'm looking forward to learning more about you.",
  "Let's get you set up for a great interview experience.",
  "I hope you're ready for an insightful session.",
  "Today, we'll explore your skills and experience together.",
  "Thanks for taking the time to be here.",
  "I'm excited to hear about your journey so far.",
  "Let's make this a productive conversation.",
];

const TRANSITION_PHRASES = [
  "Thank you for your response. Let's continue with the next question.",
  "Let's move on to the next topic.",
  "Thank you. Here's the next question.",
  "We'll now proceed to the next question.",
  "Let's continue with the interview.",
  "Moving forward, here's the next question.",
  "Let's explore another aspect of your experience.",
  "Thank you for sharing that. Let's continue.",
  "We'll now move to the next question.",
  "Let's proceed with the next part of the interview.",
  "I'd like to ask you another question.",
  "Let's continue with another question.",
  "We'll now discuss a different area.",
  "Thank you. Let's move to the next question.",
  "Let's continue with the interview process.",
  "Now, let's move on to another question.",
  "We'll continue with the next question.",
  "Let's shift our focus to another topic.",
  "Thank you. We'll proceed with the next question.",
  "Let's keep going.",
  "We'll now move forward with the interview.",
  "Let's continue to the next question.",
  "Thank you for your time. Here's the next question.",
  "Let's move ahead.",
  "We'll continue with another question."
];

const TRIGGER_REGEX = /start\s*now/i;

const el = (id) => document.getElementById(id);

function setVoiceState(state) {
  document.body.classList.remove("ai-speaking", "user-speaking");
  if (state) document.body.classList.add(state);
}

function showStage(stageId) {
  ["stage-upload", "stage-verify", "stage-interview", "stage-results"].forEach((id) => {
    el(id).classList.toggle("hidden", id !== stageId);
  });
}

function speak(text) {
  return new Promise((resolve) => {
    const caption = el("speech-caption");
    if (!synth) {
      resolve();
      return;
    }
    synth.cancel();
    setVoiceState("ai-speaking");
    if (caption) caption.textContent = text;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    const finish = () => {
      setVoiceState(null);
      if (caption) caption.textContent = "";
      resolve();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    synth.speak(utterance);
  });
}

function createRecognition() {
  const rec = new SpeechRecognitionImpl();
  rec.lang = "en-US";
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  return rec;
}

async function listenOnce({ onInterim, onFinal, onError, silenceTimeoutMs = 4000 }) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
  } catch (err) {
    console.error("Mic permission error:", err);
    setVoiceState(null);
    if (onError) onError("permission-denied");
    return;
  }

  setVoiceState("user-speaking");

  let finalTranscript = "";
  let silenceTimer = null;
  let stoppedManually = false;

  const clearSilenceTimer = () => {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  };

  const resetSilenceTimer = () => {
    clearSilenceTimer();
    silenceTimer = setTimeout(() => {
      stoppedManually = true;
      try {
        recognition.stop();
      } catch (err) {
        // already stopped, ignore
      }
    }, silenceTimeoutMs);
  };

  const startRecognitionInstance = () => {
    recognition = createRecognition();
    recognition.continuous = true;

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + " ";
        } else {
          interim += transcript;
        }
      }
      if (onInterim) onInterim((finalTranscript + interim).trim());
      resetSilenceTimer();
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") {
        return;
      }
      clearSilenceTimer();
      setVoiceState(null);
      if (onError) onError(event.error);
    };

    recognition.onend = () => {
      if (stoppedManually) {
        clearSilenceTimer();
        setVoiceState(null);
        if (onFinal) onFinal(finalTranscript.trim());
        return;
      }
      try {
        startRecognitionInstance();
      } catch (err) {
        clearSilenceTimer();
        setVoiceState(null);
        if (onFinal) onFinal(finalTranscript.trim());
      }
    };

    try {
      recognition.start();
    } catch (err) {
      console.error("Recognition start error:", err);
      setVoiceState(null);
      if (onError) onError("start-failed");
    }
  };

  resetSilenceTimer();
  startRecognitionInstance();
}

// ---------- INTRO: spoken the moment the site is visited ----------

// ---------- INTRO & STARTUP ----------

async function playIntro() {
  if (introStarted) return;
  introStarted = true;

  const introStatus = el("intro-status");
  if (introStatus) introStatus.textContent = "Snow is speaking...";

  await speak("Hi, I am Snow, your AI interviewer.");

  const greeting = GREETING_LINES[Math.floor(Math.random() * GREETING_LINES.length)];
  await speak(greeting);

  await speak("Please share your resume with me, and let's begin the interview.");

  if (introStatus) introStatus.textContent = "";
  showStage("stage-upload");
}

window.addEventListener("DOMContentLoaded", () => {
  const kickoff = async () => {
    document.removeEventListener("click", kickoff);
    document.removeEventListener("keydown", kickoff);
    await playIntro();
  };

  document.addEventListener("click", kickoff, { once: true });
  document.addEventListener("keydown", kickoff, { once: true });

  const introStatus = el("intro-status");
  if (introStatus) {
    introStatus.textContent = "Click or tap anywhere on the page to begin.";
  }
});

// ---------- STAGE 1: UPLOAD + NAME ----------

const resumeInput = el("resume-input");
const nameInput = el("candidate-name-input");
const uploadBtn = el("upload-btn");
const uploadLabelText = el("upload-label-text");
const uploadStatus = el("upload-status");

function refreshUploadButtonState() {
  uploadBtn.disabled = !(resumeInput.files.length > 0 && nameInput.value.trim().length > 0);
}

resumeInput.addEventListener("change", () => {
  if (resumeInput.files.length > 0) {
    uploadLabelText.textContent = resumeInput.files[0].name;
  }
  refreshUploadButtonState();
});

nameInput.addEventListener("input", refreshUploadButtonState);

uploadBtn.addEventListener("click", async () => {
  const file = resumeInput.files[0];
  if (!file) return;

  candidateName = nameInput.value.trim() || "Candidate";

  uploadBtn.disabled = true;
  uploadStatus.textContent = "Extracting resume and generating questions...";

  const formData = new FormData();
  formData.append("resume", file);

  try {
    const response = await fetch("/api/upload-resume/", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Upload failed.");
    }

    sessionId = data.session_id;
    questions = data.questions.sort((a, b) => a.order - b.order);
    uploadStatus.textContent = "";

    currentState = State.VERIFYING;
    showStage("stage-verify");
    await runVerificationLoop();
  } catch (err) {
    uploadStatus.textContent = `Error: ${err.message}`;
    refreshUploadButtonState();
  }
});

// ---------- STAGE 2: VERIFY ----------

async function runVerificationLoop() {
  const micBadge = el("verify-mic-badge");
  const heardText = el("verify-heard-text");
  const feedback = el("verify-feedback");

  feedback.textContent = "";
  heardText.textContent = "";

  await speak("Please say: Start now.");

  await listenOnce({
    onInterim: (text) => {
      heardText.textContent = `Heard: "${text}"`;
    },
    onFinal: async (finalText) => {
      const match = finalText.match(TRIGGER_REGEX);
      if (match) {
        feedback.textContent = `Verified! Welcome, ${candidateName}.`;
        feedback.className = "mt-2 text-sm";
        feedback.style.color = "#16a34a";
        await speak(`Thanks, ${candidateName}. Let's begin.`);
        startInterview();
      } else {
        feedback.textContent = "Couldn't verify that phrase. Please try again.";
        feedback.style.color = "#d97706";
        await speak("Sorry, I didn't catch that. Please repeat the phrase.");
        runVerificationLoop();
      }
    },
    onError: async () => {
      feedback.textContent = "Microphone error. Please try again.";
      feedback.style.color = "#dc2626";
      await speak("I couldn't hear you clearly. Let's try that again.");
      runVerificationLoop();
    },
  });
}

// ---------- STAGE 3: INTERVIEW LOOP ----------

function startInterview() {
  currentState = State.INTERVIEWING;
  currentQuestionIndex = 0;
  answers = [];
  showStage("stage-interview");
  askQuestion();
}

async function askQuestion() {
  const question = questions[currentQuestionIndex];
  el("q-current").textContent = currentQuestionIndex + 1;
  el("progress-bar").style.width = `${((currentQuestionIndex + 1) / questions.length) * 100}%`;
  el("question-text").textContent = question.question;
  el("interview-state-label").textContent = "AI is speaking...";
  el("live-transcript").textContent = "";

  await speak(question.question);

  el("interview-state-label").textContent = "Listening... speak your answer.";

  await listenOnce({
    onInterim: (text) => {
      el("live-transcript").textContent = text;
    },
    onFinal: async (finalText) => {
      answers.push({ order: question.order, answer: finalText });

      currentQuestionIndex += 1;

      if (currentQuestionIndex < questions.length) {
        el("interview-state-label").textContent = "Processing your answer...";
        const transition = TRANSITION_PHRASES[Math.floor(Math.random() * TRANSITION_PHRASES.length)];
        await speak(transition);
        askQuestion();
      } else {
        el("interview-state-label").textContent = "Wrapping up...";
        await speak("That completes all three questions. Thank you for your time. Generating your feedback now.");
        finishInterview();
      }
    },
    onError: async () => {
      el("interview-state-label").textContent = "Didn't catch that, let's retry this question.";
      await speak("Sorry, I couldn't hear that clearly. Let's try that question again.");
      askQuestion();
    },
  });
}

// ---------- STAGE 4: RESULTS ----------

async function finishInterview() {
  currentState = State.COMPLETED;

  try {
    const response = await fetch("/api/submit-interview/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        candidate_name: candidateName,
        answers: answers,
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Submission failed.");
    }

    renderResults(data);
  } catch (err) {
    el("interview-state-label").textContent = `Error generating feedback: ${err.message}`;
  }
}

function renderResults(data) {
  showStage("stage-results");
  el("score-circle").textContent = data.overall_score ?? "--";
  el("candidate-name-result").textContent = data.candidate_name || "Candidate";
  el("result-strengths").textContent = data.strengths;
  el("result-technical").textContent = data.technical_accuracy;
  el("result-feedback").textContent = data.feedback_summary;

  const transcriptContainer = el("result-transcript");
  transcriptContainer.innerHTML = "";
  data.questions.forEach((q) => {
    const item = document.createElement("div");
    item.className = "transcript-item";
    item.innerHTML = `<div class="q">Q${q.order}. ${escapeHtml(q.question_text)}</div><div class="a">${escapeHtml(q.answer_text || "(no answer captured)")}</div>`;
    transcriptContainer.appendChild(item);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- INIT ----------

if (!SpeechRecognitionImpl) {
  el("intro-status").textContent =
    "Your browser doesn't support the Web Speech API. Please use Chrome, Edge, or Safari.";
}