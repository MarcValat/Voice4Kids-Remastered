from flask import Flask, render_template, request, jsonify, send_file
import os
import shutil
from PyPDF2 import PdfReader
from docx import Document
import torch
from TTS.api import TTS
from werkzeug.utils import secure_filename

app = Flask(__name__)
UPLOAD_FOLDER = "uploads"
OUTPUT_FOLDER = "outputs"
STATIC_AUDIO_FOLDER = 'static/audio'
os.makedirs(STATIC_AUDIO_FOLDER, exist_ok=True)
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

device = "cuda" if torch.cuda.is_available() else "cpu"

MODELS = {
    "your_tts": {
        "name": "tts_models/multilingual/multi-dataset/your_tts",
        "params": {"language": "fr-fr", "speaker_wav": None},
        "speakers": []
    },
    "xtts_v2": {
        "name": "tts_models/multilingual/multi-dataset/xtts_v2",
        "params": {"language": "fr"},
        "speakers": ["Gracie Wise", "Daisy Studious", "Tammie Ema"]
    }
}

def extract_text_from_pdf(file_path):
    reader = PdfReader(file_path)
    return "".join(page.extract_text() for page in reader.pages if page.extract_text())

def extract_text_from_docx(file_path):
    doc = Document(file_path)
    return "\n".join(paragraph.text for paragraph in doc.paragraphs)

def get_speakers():
    try:
        files = os.listdir(UPLOAD_FOLDER)
        speakers = [f.replace('.wav', '').replace('recording_', '') for f in files if f.endswith('.wav')]
        MODELS["your_tts"]["speakers"] = speakers
        return speakers
    except Exception as e:
        print(f"Erreur lors de la récupération des fichiers audio : {e}")
        return []

def synthesize_speech_your_tts(text, speaker_wav=None):
    output_file = os.path.join(OUTPUT_FOLDER, "output_your_tts.wav")
    model_info = MODELS["your_tts"]
    tts = TTS(model_name=model_info["name"], progress_bar=True).to(device)
    params = model_info["params"].copy()
    if speaker_wav:
        params["speaker_wav"] = speaker_wav  # Utilisez le fichier audio envoyé
    tts.tts_to_file(text=text, **params, file_path=output_file)
    return output_file

def synthesize_speech_xtts_v2(text, speaker_id=None):
    output_file = os.path.join(OUTPUT_FOLDER, "output_xtts_v2.wav")
    model_info = MODELS["xtts_v2"]
    tts = TTS(model_name=model_info["name"], progress_bar=True).to(device)
    params = model_info["params"].copy()
    if speaker_id:
        params["speaker"] = speaker_id
    tts.tts_to_file(text=text, **params, file_path=output_file)
    return output_file

def synthesize_speech(text, model, speaker_wav=None, speaker_id=None):
    print(model)
    if model == "your_tts":
        return synthesize_speech_your_tts(text, speaker_wav)
    elif model == "xtts_v2":
        return synthesize_speech_xtts_v2(text, speaker_id)
    else:
        raise ValueError("Modèle non supporté")

@app.route('/')
def index():
    get_speakers()
    recording_path = request.args.get("recording")
    return render_template('index.html', models=MODELS, recording_path=recording_path)

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file received"})

    file = request.files['file']
    file_path = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(file_path)

    if file.filename.endswith('.pdf'):
        text = extract_text_from_pdf(file_path)
    elif file.filename.endswith('.docx'):
        text = extract_text_from_docx(file_path)
    else:
        return jsonify({"error": "Unsupported format"})

    model = request.form.get("model")
    print(f"Modèle reçu : {model}")  # Ajoutez ce log pour vérifier la valeur du modèle

    if model == "your_tts":
        speaker = request.form.get("speaker")
        speaker_wav = f"uploads/recording_{speaker}.wav"
        speaker_id = None
        
    elif model == 'xtts_v2':
        speaker_wav = None
        speaker_id = request.form.get("speaker")

    if model == "your_tts" and 'speaker_wav' in request.files:
        speaker_file = request.files['speaker_wav']
        speaker_wav = os.path.join(UPLOAD_FOLDER, speaker_file.filename)
        speaker_file.save(speaker_wav)    

    audio_file_path = synthesize_speech(text, model, speaker_wav, speaker_id)

    if isinstance(audio_file_path, str):
        audio_filename = os.path.basename(audio_file_path)
        destination_path = os.path.join(STATIC_AUDIO_FOLDER, audio_filename)
        shutil.copy(audio_file_path, destination_path)
        return jsonify({"text": text, "audio": f'/static/audio/{audio_filename}'})

    return jsonify({"error": "Failed to generate audio"})

@app.route('/record')
def record_page():
    return render_template('record.html')

@app.route('/save_recording', methods=['POST'])
def save_recording():
    if 'audio' not in request.files:
        return jsonify({"error": "No audio file received"})

    file = request.files['audio']
    file_path = os.path.join(UPLOAD_FOLDER, secure_filename(file.filename))
    file.save(file_path)

    return jsonify({"message": "Recording saved", "file_path": file_path})

@app.route('/get_models')
def get_models():
    return jsonify(MODELS)

@app.route('/log', methods=['POST'])
def log():
    data = request.get_json()
    print(f"[CLIENT LOG] {data['log']}")
    return '', 204

if __name__ == '__main__':
    app.run(debug=True)
