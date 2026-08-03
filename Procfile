web: python manage.py migrate --noinput && python manage.py collectstatic --noinput && gunicorn interview_project.wsgi --bind 0.0.0.0:$PORT
