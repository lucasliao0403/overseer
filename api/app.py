from flask import Flask, request, jsonify
import os

# Initialize Flask app
app = Flask(__name__)

# Configuration
app.config['DEBUG'] = True
app.config['JSON_SORT_KEYS'] = False

# Example routes
@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'message': 'API is running'
    }), 200

@app.route('/api/data', methods=['GET'])
def get_data():
    """Example data endpoint"""
    sample_data = {
        'items': [
            {'id': 1, 'name': 'Item 1'},
            {'id': 2, 'name': 'Item 2'},
            {'id': 3, 'name': 'Item 3'}
        ],
        'count': 3
    }
    return jsonify(sample_data), 200

# Error handlers
@app.errorhandler(404)
def not_found(error):
    return jsonify({
        'status': 'error',
        'message': 'Resource not found'
    }), 404

@app.errorhandler(500)
def server_error(error):
    return jsonify({
        'status': 'error',
        'message': 'Internal server error'
    }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)