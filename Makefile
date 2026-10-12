.PHONY: test build demo api instalar

instalar:
	python3 -m pip install -r backend/requirements.txt
	cd frontend && npm install

test:
	bash scripts/testar.sh

build:
	cd frontend && node build.mjs

demo:
	cd frontend && node build.mjs --demo

api: build
	cd backend && uvicorn api.main:app --reload
