// Version Comparison Module
// Provides side-by-side version comparison functionality

class VersionCompare {
  constructor() {
    this.currentComparison = null;
    this.init();
  }

  init() {
    this.createCompareModal();
  }

  createCompareModal() {
    const modalHTML = `
      <div class="modal fade" id="versionCompareModal" tabindex="-1">
        <div class="modal-dialog modal-xl">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">
                <i class="bi bi-file-diff"></i> Version Comparison
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div id="version-compare-content">
                <div class="row mb-3">
                  <div class="col-6">
                    <div class="card">
                      <div class="card-header bg-primary text-white">
                        <h6 class="mb-0">
                          <i class="bi bi-arrow-left-circle"></i>
                          <span id="compare-version-1">Version 1</span>
                        </h6>
                      </div>
                      <div class="card-body">
                        <div id="compare-details-1" class="version-details">
                          <div class="spinner-border spinner-border-sm" role="status">
                            <span class="visually-hidden">Loading...</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="col-6">
                    <div class="card">
                      <div class="card-header bg-success text-white">
                        <h6 class="mb-0">
                          <i class="bi bi-arrow-right-circle"></i>
                          <span id="compare-version-2">Version 2</span>
                        </h6>
                      </div>
                      <div class="card-body">
                        <div id="compare-details-2" class="version-details">
                          <div class="spinner-border spinner-border-sm" role="status">
                            <span class="visually-hidden">Loading...</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- File List Comparison -->
                <div class="card">
                  <div class="card-header">
                    <h6 class="mb-0">
                      <i class="bi bi-list-ul"></i> File Comparison
                    </h6>
                  </div>
                  <div class="card-body">
                    <div id="file-comparison-list">
                      <!-- File comparison will be inserted here -->
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Append modal to body if it doesn't exist
    if (!document.getElementById('versionCompareModal')) {
      document.body.insertAdjacentHTML('beforeend', modalHTML);
    }
  }

  /**
   * Compare two versions
   * @param {Object} version1 - First version object { game, version, key }
   * @param {Object} version2 - Second version object { game, version, key }
   */
  async compare(version1, version2) {
    this.currentComparison = { version1, version2 };

    // Update modal titles
    document.getElementById('compare-version-1').textContent =
      `${version1.game} v${version1.version}`;
    document.getElementById('compare-version-2').textContent =
      `${version2.game} v${version2.version}`;

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('versionCompareModal'));
    modal.show();

    // Load comparison data
    await this.loadComparisonData();
  }

  async loadComparisonData() {
    try {
      // Fetch file lists for both versions
      const [files1, files2] = await Promise.all([
        this.getArtifactFiles(this.currentComparison.version1.key),
        this.getArtifactFiles(this.currentComparison.version2.key)
      ]);

      // Display version details
      this.displayVersionDetails('compare-details-1', this.currentComparison.version1, files1);
      this.displayVersionDetails('compare-details-2', this.currentComparison.version2, files2);

      // Display file comparison
      this.displayFileComparison(files1, files2);
    } catch (error) {
      console.error('Error loading comparison data:', error);
      window.toast?.error('Failed to load comparison data');
    }
  }

  /**
   * Get file list from an artifact (ZIP file)
   * @param {string} artifactKey - S3 artifact key
   */
  async getArtifactFiles(artifactKey) {
    try {
      const response = await fetch(`/api/artifacts/files?key=${encodeURIComponent(artifactKey)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch artifact files');
      }
      const data = await response.json();
      return data.files || [];
    } catch (error) {
      console.error('Error fetching artifact files:', error);
      return [];
    }
  }

  displayVersionDetails(containerId, version, files) {
    const container = document.getElementById(containerId);
    const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
    const formattedSize = this.formatBytes(totalSize);

    const html = `
      <table class="table table-sm table-borderless mb-0">
        <tbody>
          <tr>
            <th width="40%">Game:</th>
            <td>${version.game}</td>
          </tr>
          <tr>
            <th>Version:</th>
            <td><span class="badge bg-primary">${version.version}</span></td>
          </tr>
          <tr>
            <th>Total Files:</th>
            <td>${files.length} files</td>
          </tr>
          <tr>
            <th>Total Size:</th>
            <td>${formattedSize}</td>
          </tr>
          <tr>
            <th>Artifact Key:</th>
            <td><code class="small">${version.key}</code></td>
          </tr>
        </tbody>
      </table>
    `;

    container.innerHTML = html;
  }

  displayFileComparison(files1, files2) {
    const container = document.getElementById('file-comparison-list');

    // Create file maps for easier comparison
    const fileMap1 = new Map(files1.map(f => [f.name, f]));
    const fileMap2 = new Map(files2.map(f => [f.name, f]));

    // Get all unique file names
    const allFileNames = new Set([...fileMap1.keys(), ...fileMap2.keys()]);
    const sortedFiles = Array.from(allFileNames).sort();

    let html = `
      <div class="file-diff-list">
        <div class="row mb-2 fw-bold border-bottom pb-2">
          <div class="col-6">File Name</div>
          <div class="col-2 text-center">Version 1</div>
          <div class="col-2 text-center">Version 2</div>
          <div class="col-2 text-center">Status</div>
        </div>
    `;

    sortedFiles.forEach(fileName => {
      const file1 = fileMap1.get(fileName);
      const file2 = fileMap2.get(fileName);

      let status = '';
      let statusBadge = '';
      let rowClass = '';

      if (file1 && file2) {
        // File exists in both versions
        if (file1.size === file2.size) {
          status = 'Unchanged';
          statusBadge = '<span class="badge bg-secondary">Unchanged</span>';
        } else {
          status = 'Modified';
          statusBadge = '<span class="badge bg-warning text-dark">Modified</span>';
          rowClass = 'table-warning';
        }
      } else if (file1 && !file2) {
        // File removed in version 2
        status = 'Removed';
        statusBadge = '<span class="badge bg-danger">Removed</span>';
        rowClass = 'table-danger';
      } else {
        // File added in version 2
        status = 'Added';
        statusBadge = '<span class="badge bg-success">Added</span>';
        rowClass = 'table-success';
      }

      const size1 = file1 ? this.formatBytes(file1.size) : '-';
      const size2 = file2 ? this.formatBytes(file2.size) : '-';

      html += `
        <div class="row py-2 border-bottom ${rowClass}">
          <div class="col-6">
            <code class="small">${fileName}</code>
          </div>
          <div class="col-2 text-center small">${size1}</div>
          <div class="col-2 text-center small">${size2}</div>
          <div class="col-2 text-center">${statusBadge}</div>
        </div>
      `;
    });

    html += '</div>';

    // Add summary
    const addedCount = sortedFiles.filter(f => !fileMap1.has(f) && fileMap2.has(f)).length;
    const removedCount = sortedFiles.filter(f => fileMap1.has(f) && !fileMap2.has(f)).length;
    const modifiedCount = sortedFiles.filter(f => {
      const f1 = fileMap1.get(f);
      const f2 = fileMap2.get(f);
      return f1 && f2 && f1.size !== f2.size;
    }).length;
    const unchangedCount = sortedFiles.filter(f => {
      const f1 = fileMap1.get(f);
      const f2 = fileMap2.get(f);
      return f1 && f2 && f1.size === f2.size;
    }).length;

    html = `
      <div class="alert alert-info mb-3">
        <strong>Summary:</strong>
        <span class="badge bg-success ms-2">${addedCount} Added</span>
        <span class="badge bg-danger ms-1">${removedCount} Removed</span>
        <span class="badge bg-warning text-dark ms-1">${modifiedCount} Modified</span>
        <span class="badge bg-secondary ms-1">${unchangedCount} Unchanged</span>
      </div>
    ` + html;

    container.innerHTML = html;
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  window.versionCompare = new VersionCompare();
});
