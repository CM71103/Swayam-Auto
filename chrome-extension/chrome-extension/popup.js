document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const solverModeSelect = document.getElementById('solverMode');
  const courseIdInput = document.getElementById('courseId');
  const autoStartCheck = document.getElementById('autoStart');
  const saveBtn = document.getElementById('saveBtn');
  const triggerBtn = document.getElementById('triggerBtn');
  const statusMsg = document.getElementById('statusMsg');

  // Load existing settings
  chrome.storage.local.get(['gemini_api_key', 'course_id', 'auto_start', 'solver_mode'], (res) => {
    if (res.gemini_api_key) apiKeyInput.value = res.gemini_api_key;
    if (res.course_id) courseIdInput.value = res.course_id;
    if (res.auto_start !== undefined) autoStartCheck.checked = res.auto_start;
    if (res.solver_mode) solverModeSelect.value = res.solver_mode;
  });

  saveBtn.addEventListener('click', () => {
    const gemini_api_key = apiKeyInput.value.trim();
    const solver_mode = solverModeSelect.value;
    const course_id = courseIdInput.value.trim() || '20';
    const auto_start = autoStartCheck.checked;

    chrome.storage.local.set({ gemini_api_key, solver_mode, course_id, auto_start }, () => {
      statusMsg.textContent = '✅ Settings saved successfully!';
      setTimeout(() => { statusMsg.textContent = ''; }, 3000);
    });
  });

  triggerBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://swayam-plus-lms.iitmpravartak.org.in/my/courses.php' });
  });
});
