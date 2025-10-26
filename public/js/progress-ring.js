// Progress Ring Component for circular progress visualization
class ProgressRing {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.currentProgress = 0;
    this.currentStage = null;
    this.animationFrame = null;
    this.init();
  }

  init() {
    if (!this.container) return;

    // Create SVG progress ring
    this.container.innerHTML = `
      <div class="progress-ring-container">
        <svg class="progress-ring-svg" width="200" height="200">
          <circle class="progress-ring-bg" cx="100" cy="100" r="85" />
          <circle class="progress-ring-fill" cx="100" cy="100" r="85" />
        </svg>
        <div class="progress-ring-center">
          <div class="progress-percentage">0%</div>
          <div class="progress-stage">Initializing</div>
        </div>
      </div>
      <div class="stage-flow">
        <div class="stage-item" data-stage="downloading">
          <div class="stage-icon">
            <i class="bi bi-download"></i>
          </div>
          <div class="stage-label">Downloading</div>
        </div>
        <div class="stage-arrow">→</div>
        <div class="stage-item" data-stage="extracting">
          <div class="stage-icon">
            <i class="bi bi-file-zip"></i>
          </div>
          <div class="stage-label">Extracting</div>
        </div>
        <div class="stage-arrow">→</div>
        <div class="stage-item" data-stage="uploading">
          <div class="stage-icon">
            <i class="bi bi-cloud-upload"></i>
          </div>
          <div class="stage-label">Uploading</div>
        </div>
        <div class="stage-arrow">→</div>
        <div class="stage-item" data-stage="verifying">
          <div class="stage-icon">
            <i class="bi bi-check2"></i>
          </div>
          <div class="stage-label">Verifying</div>
        </div>
        <div class="stage-arrow">→</div>
        <div class="stage-item" data-stage="complete">
          <div class="stage-icon">
            <i class="bi bi-check-circle"></i>
          </div>
          <div class="stage-label">Complete</div>
        </div>
      </div>
    `;

    this.progressRing = this.container.querySelector('.progress-ring-fill');
    this.percentageEl = this.container.querySelector('.progress-percentage');
    this.stageEl = this.container.querySelector('.progress-stage');

    // Calculate circumference for progress ring
    const radius = 85;
    this.circumference = 2 * Math.PI * radius;
    this.progressRing.style.strokeDasharray = this.circumference;
    this.progressRing.style.strokeDashoffset = this.circumference;
  }

  setProgress(percentage) {
    const targetProgress = Math.min(100, Math.max(0, percentage));
    this.animate(this.currentProgress, targetProgress);
    this.currentProgress = targetProgress;

    // Update percentage text
    this.percentageEl.textContent = Math.round(targetProgress) + '%';
  }

  animate(from, to) {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }

    const duration = 500; // ms
    const startTime = performance.now();

    const step = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      const current = from + (to - from) * this.easeInOutCubic(progress);
      const offset = this.circumference - (current / 100) * this.circumference;
      this.progressRing.style.strokeDashoffset = offset;

      if (progress < 1) {
        this.animationFrame = requestAnimationFrame(step);
      }
    };

    this.animationFrame = requestAnimationFrame(step);
  }

  setStage(stage, stageLabel) {
    this.currentStage = stage;

    // Update stage text
    if (stageLabel) {
      this.stageEl.textContent = stageLabel;
    }

    // Update stage flow highlighting
    const stageItems = this.container.querySelectorAll('.stage-item');
    const stageMap = {
      'downloading': 0,
      'extracting': 1,
      'uploading': 2,
      'verifying': 3,
      'complete': 4
    };

    const activeIndex = stageMap[stage] !== undefined ? stageMap[stage] : -1;

    stageItems.forEach((item, index) => {
      if (index < activeIndex) {
        item.classList.remove('active');
        item.classList.add('completed');
      } else if (index === activeIndex) {
        item.classList.remove('completed');
        item.classList.add('active');
      } else {
        item.classList.remove('active', 'completed');
      }
    });
  }

  reset() {
    this.currentProgress = 0;
    this.currentStage = null;
    this.setProgress(0);
    this.stageEl.textContent = 'Initializing';

    const stageItems = this.container.querySelectorAll('.stage-item');
    stageItems.forEach(item => {
      item.classList.remove('active', 'completed');
    });
  }

  complete() {
    this.setProgress(100);
    this.setStage('complete', 'Complete');

    // Add success color
    this.progressRing.style.stroke = '#198754';
  }

  error(message) {
    this.stageEl.textContent = message || 'Error';

    // Add error color
    this.progressRing.style.stroke = '#dc3545';

    // Mark all stages as inactive
    const stageItems = this.container.querySelectorAll('.stage-item');
    stageItems.forEach(item => {
      item.classList.remove('active', 'completed');
    });
  }

  // Easing function for smooth animation
  easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProgressRing;
}
