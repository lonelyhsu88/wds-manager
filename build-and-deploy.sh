#!/bin/bash

# WebUI Deployment System Manager - Build and Deploy Script
# This script builds multi-architecture Docker images using buildx

set -e

# Load .env file if it exists
if [ -f .env ]; then
    echo "Loading configuration from .env file..."
    export $(cat .env | grep -v '^#' | xargs)
fi

# Configuration from .env or defaults
IMAGE_NAME="${DOCKER_IMAGE_NAME:-wds-manager}"
VERSION="${APP_VERSION:-$(node -p "require('./package.json').version")}"
REGISTRY="${DOCKER_REGISTRY:-}"  # Set to your registry, e.g., "registry.example.com"
PLATFORMS="${BUILD_PLATFORMS:-linux/amd64,linux/arm64}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Record start time
START_TIME=$(date +%s)
START_TIME_DISPLAY=$(date '+%Y-%m-%d %H:%M:%S')

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}WebUI Deployment System Manager${NC}"
echo -e "${BLUE}Build and Deploy Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Start Time: ${START_TIME_DISPLAY}${NC}"
echo ""

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to calculate and display completion time
show_completion_time() {
    local END_TIME=$(date +%s)
    local END_TIME_DISPLAY=$(date '+%Y-%m-%d %H:%M:%S')
    local DURATION=$((END_TIME - START_TIME))
    local HOURS=$((DURATION / 3600))
    local MINUTES=$(((DURATION % 3600) / 60))
    local SECONDS=$((DURATION % 60))

    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}Completion Time: ${END_TIME_DISPLAY}${NC}"

    if [ $HOURS -gt 0 ]; then
        echo -e "${BLUE}Total Duration: ${HOURS}h ${MINUTES}m ${SECONDS}s${NC}"
    elif [ $MINUTES -gt 0 ]; then
        echo -e "${BLUE}Total Duration: ${MINUTES}m ${SECONDS}s${NC}"
    else
        echo -e "${BLUE}Total Duration: ${SECONDS}s${NC}"
    fi
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if buildx is available
if ! docker buildx version &> /dev/null; then
    print_error "Docker buildx is not available. Please upgrade Docker to a version that supports buildx."
    exit 1
fi

# Create builder if it doesn't exist
BUILDER_NAME="wds-builder"
if ! docker buildx ls | grep -q "$BUILDER_NAME"; then
    print_info "Creating buildx builder: $BUILDER_NAME"
    docker buildx create --name "$BUILDER_NAME" --use --driver docker-container
else
    print_info "Using existing builder: $BUILDER_NAME"
    docker buildx use "$BUILDER_NAME"
fi

# Bootstrap the builder
print_info "Bootstrapping builder..."
docker buildx inspect --bootstrap

# Determine image tags
if [ -n "$REGISTRY" ]; then
    IMAGE_TAG_VERSIONED="${REGISTRY}/${IMAGE_NAME}:${VERSION}"
    IMAGE_TAG_LATEST="${REGISTRY}/${IMAGE_NAME}:latest"
else
    IMAGE_TAG_VERSIONED="${IMAGE_NAME}:${VERSION}"
    IMAGE_TAG_LATEST="${IMAGE_NAME}:latest"
fi

print_info "Building image for platforms: $PLATFORMS"
print_info "Version: $VERSION"
print_info "Image tags:"
echo "  - $IMAGE_TAG_VERSIONED"
echo "  - $IMAGE_TAG_LATEST"
echo ""

# Ask for confirmation
read -p "Do you want to proceed with the build? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_warning "Build cancelled by user"
    exit 0
fi

# Build options
BUILD_ARGS=""
PUSH_FLAG=""

# Ask if user wants to push to registry
if [ -n "$REGISTRY" ]; then
    read -p "Do you want to push to registry after build? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        PUSH_FLAG="--push"
        print_info "Images will be pushed to registry"
    else
        PUSH_FLAG="--load"
        print_warning "Images will only be loaded locally (single platform)"
        PLATFORMS="linux/amd64"  # --load only works with single platform
    fi
else
    PUSH_FLAG="--load"
    print_warning "No registry specified, loading locally (single platform)"
    PLATFORMS="linux/amd64"
fi

# Build the image
print_info "Starting build process..."
echo ""

docker buildx build \
    --platform "$PLATFORMS" \
    --tag "$IMAGE_TAG_VERSIONED" \
    --tag "$IMAGE_TAG_LATEST" \
    --build-arg VERSION="$VERSION" \
    --build-arg BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
    $PUSH_FLAG \
    $BUILD_ARGS \
    .

if [ $? -eq 0 ]; then
    echo ""
    print_success "Build completed successfully!"
    echo ""
    print_info "Image details:"
    echo "  Name: $IMAGE_NAME"
    echo "  Version: $VERSION"
    echo "  Platforms: $PLATFORMS"
    echo "  Tags:"
    echo "    - $IMAGE_TAG_VERSIONED"
    echo "    - $IMAGE_TAG_LATEST"
    echo ""

    if [[ $PUSH_FLAG == "--push" ]]; then
        print_success "Images pushed to registry"
    else
        print_info "Images loaded locally"
    fi

    echo ""
    print_info "Next steps:"
    echo "  1. Run locally: docker-compose up -d"
    echo "  2. View logs: docker-compose logs -f"
    echo "  3. Access UI: http://localhost:3000"
    echo ""

    # Ask if user wants to run docker-compose
    read -p "Do you want to start the service with docker-compose? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info "Starting services with docker-compose..."
        docker-compose up -d
        print_success "Services started!"
        echo ""
        print_info "View logs: docker-compose logs -f wds-manager"
        print_info "Access UI: http://localhost:3000"
    fi

    # Show completion time
    show_completion_time
else
    print_error "Build failed!"
    show_completion_time
    exit 1
fi
