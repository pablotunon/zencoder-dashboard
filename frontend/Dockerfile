FROM nginx:alpine

# Create a minimal index.html placeholder
RUN echo '<!DOCTYPE html><html><head><title>AgentHub Analytics</title></head><body><h1>AgentHub Analytics Dashboard</h1><p>Frontend not yet built. This is a Phase 0 stub.</p></body></html>' > /usr/share/nginx/html/index.html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
