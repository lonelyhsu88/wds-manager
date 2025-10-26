// Socket.IO progress handling
const socket = io();

socket.on('connect', () => {
  // Connected to WebSocket server
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

  // Update message with active artifacts
  if (messageEl) {
    let message = progress.message || '';
    message += '<br><span class="badge bg-primary">' + (progress.percentage || 0) + '%</span>';

    // Show all active artifacts (the 3 parallel processing items)
    if (progress.activeArtifacts && progress.activeArtifacts.length > 0) {
      message += '<br><div class="mt-3" style="border: 1px solid rgba(13, 110, 253, 0.2); border-radius: 6px; padding: 12px; background: linear-gradient(to bottom, rgba(13, 110, 253, 0.05), rgba(13, 110, 253, 0.02));">';
      message += `<div class="mb-2"><strong><i class="bi bi-cloud-upload"></i> Processing ${progress.activeArtifacts.length} artifact(s) in parallel:</strong></div>`;

      progress.activeArtifacts.forEach((artifact, idx) => {
        const statusIcon = {
          'downloading': '<i class="bi bi-download text-primary"></i>',
          'extracting': '<i class="bi bi-file-zip text-warning"></i>',
          'uploading': '<i class="bi bi-cloud-upload text-info"></i>'
        }[artifact.status] || '<i class="bi bi-hourglass-split"></i>';

        const statusText = {
          'downloading': 'Downloading',
          'extracting': 'Extracting',
          'uploading': 'Uploading'
        }[artifact.status] || artifact.status;

        message += `
          <div class="card mb-2" style="border: 1px solid rgba(0,0,0,0.1); box-shadow: 0 2px 4px rgba(0,0,0,0.08);">
            <div class="card-body p-3">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <div class="d-flex align-items-center" style="flex: 1; min-width: 0;">
                  ${statusIcon}
                  <strong class="ms-2 text-truncate" style="max-width: 300px;" title="${escapeHtml(artifact.name)}">${escapeHtml(artifact.name)}</strong>
                </div>
                <span class="badge bg-info ms-2" style="min-width: 50px;">${Math.round(artifact.progress)}%</span>
              </div>
              <div class="progress" style="height: 8px;">
                <div class="progress-bar progress-bar-striped progress-bar-animated bg-info"
                     role="progressbar"
                     style="width: ${artifact.progress}%"
                     aria-valuenow="${artifact.progress}"
                     aria-valuemin="0"
                     aria-valuemax="100"></div>
              </div>
              <div class="mt-1">
                <small class="text-muted">${statusText}${artifact.currentFile ? ': ' + escapeHtml(artifact.currentFile) : ''}</small>
              </div>
            </div>
          </div>
        `;
      });

      message += '</div>';
    }

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
