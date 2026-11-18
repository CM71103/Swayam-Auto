# ⚡ Swayam-Auto

An automated Tampermonkey userscript for the SWAYAM Plus LMS (CIDCOM course).

## Features

- **Automatic Start**: Begins scanning and processing modules after a 3-second countdown.
- **Incomplete Module Detection**: Scans the syllabus and automatically opens the next incomplete and unlocked module.
- **H5P Video Fast-Forward**: Seeks interactive video modules directly to completion.
- **AI-Powered Quiz Solver**: Sends end-of-video multiple-choice questions to Google Gemini (`gemini-2.5-flash`) API and automatically selects the correct answers.
- **Automatic Submission**: Clicks the summary star, submits quiz answers, enables the next video, and returns to the course overview to repeat.
- **Safe Key Storage**: Gemini API key is stored securely in your browser's extension storage (`GM_setValue`), not hardcoded in the repository.

## Installation

1. Install the [Tampermonkey](https://www.tampermonkey.net/) extension for Chrome/Edge/Firefox.
2. If using Chrome, open `chrome://extensions`, turn on **Developer mode**, and enable **Allow User Scripts** under Tampermonkey.
3. In Tampermonkey dashboard, click **Create a new script** (or Import from file).
4. Copy and paste the contents of [`swayam-auto.user.js`](./swayam-auto.user.js).
5. Save the script (`Ctrl + S`).

## Usage

1. Log into [Swayam Plus LMS](https://swayam-plus-lms.iitmpravartak.org.in/).
2. Enter your Gemini API key in the floating control panel at the top-right corner.
3. The script will automatically count down and start progressing through your course modules.

## License

MIT
