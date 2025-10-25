// Socket.IO progress handling
const socket = io();

socket.on('connect', () => {
  console.log('Connected to WebSocket server');
});

socket.on('deployProgress', (progress) => {
  updateDeploymentProgress(progress);
});

socket.on('deployComplete', (result) => {
  handleDeploymentComplete(result);
});

socket.on('deployError', (errorData) => {
  handleDeploymentError(errorData);
});

function updateDeploymentProgress(progress) {
  const statusDiv = document.getElementById('deployment-status');
  const messageEl = document.getElementById('deployment-message');
  const progressBar = document.querySelector('.progress-bar');

  if (statusDiv) {
    statusDiv.style.display = 'block';
  }

  // Update progress bar
  if (progressBar && progress.percentage !== undefined) {
    progressBar.style.width = progress.percentage + '%';
    progressBar.setAttribute('aria-valuenow', progress.percentage);
  }

  // Update message
  if (messageEl) {
    let message = progress.message || '';
    if (progress.currentFile) {
      message += '<br><small class="text-muted">File: ' + escapeHtml(progress.currentFile) + '</small>';
    }
    if (progress.fileProgress) {
      message += '<br><small class="text-info">File progress: ' + progress.fileProgress + '%</small>';
    }
    message += '<br><span class="badge bg-primary">' + (progress.percentage || 0) + '%</span>';
    messageEl.innerHTML = message;
  }
}

function handleDeploymentComplete(result) {
  const statusDiv = document.getElementById('deployment-status');
  const messageEl = document.getElementById('deployment-message');
  const progressBar = document.querySelector('.progress-bar');

  if (progressBar) {
    progressBar.style.width = '100%';
    progressBar.classList.remove('progress-bar-animated');
    progressBar.classList.add('bg-success');
  }

  if (messageEl) {
    messageEl.innerHTML = `
      <i class="bi bi-check-circle"></i> Deployment completed!<br>
      <span class="badge bg-success">100%</span><br>
      <small>${result.totalFiles} files deployed in ${result.duration}</small>
    `;
  }

  // Hide after 8 seconds
  setTimeout(() => {
    if (statusDiv) statusDiv.style.display = 'none';
    if (progressBar) {
      progressBar.style.width = '0%';
      progressBar.classList.add('progress-bar-animated');
      progressBar.classList.remove('bg-success');
    }
  }, 8000);
}

function handleDeploymentError(errorData) {
  const statusDiv = document.getElementById('deployment-status');
  const messageEl = document.getElementById('deployment-message');
  const progressBar = document.querySelector('.progress-bar');

  if (progressBar) {
    progressBar.classList.remove('progress-bar-animated');
    progressBar.classList.add('bg-danger');
  }

  if (messageEl) {
    const errorMsg = errorData.error || 'Unknown error occurred';
    messageEl.innerHTML = `
      <i class="bi bi-x-circle"></i> Deployment failed!<br>
      <small class="text-danger">${escapeHtml(errorMsg)}</small>
    `;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
