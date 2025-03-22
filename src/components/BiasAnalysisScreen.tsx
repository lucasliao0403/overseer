import React from 'react';

interface BiasAnalysisScreenProps {
  activeCluster: number | null;
}

export default function BiasAnalysisScreen({ activeCluster }: BiasAnalysisScreenProps) {
  // Mock bias data for different clusters
  const clusterBiasData = [
    { // Blue Group
      genderBias: 0.82,
      ageBias: 0.65,
      ethnicityBias: 0.78,
      recommendations: [
        "Consider rebalancing your dataset to address gender representation",
        "Review language patterns in job descriptions that may contribute to bias",
        "Implement additional fairness constraints in your model training"
      ]
    },
    { // Red Group
      genderBias: 0.45,
      ageBias: 0.72,
      ethnicityBias: 0.63,
      recommendations: [
        "Address age-related bias in your training data",
        "Review decision boundaries that may disadvantage certain age groups",
        "Consider implementing age-specific fairness metrics"
      ]
    },
    { // Yellow Group
      genderBias: 0.67,
      ageBias: 0.58,
      ethnicityBias: 0.89,
      recommendations: [
        "Urgent attention needed for ethnicity representation",
        "Consider data augmentation techniques to balance ethnic groups",
        "Implement stronger regularization for ethnicity-related features"
      ]
    },
    { // Green Group
      genderBias: 0.71,
      ageBias: 0.49,
      ethnicityBias: 0.52,
      recommendations: [
        "Address gender imbalance in your model outputs",
        "Review feature importance scores for gender-correlated features",
        "Consider implementing adversarial debiasing techniques"
      ]
    }
  ];

  // Get cluster name
  const getClusterName = (clusterId: number | null) => {
    if (clusterId === null) return "All Clusters";
    const clusterNames = ["Blue Group", "Red Group", "Yellow Group", "Green Group"];
    return clusterNames[clusterId % clusterNames.length];
  };

  // Get bias data based on active cluster
  const getBiasData = () => {
    if (activeCluster === null) {
      // If no cluster is selected, show average of all clusters
      return {
        genderBias: clusterBiasData.reduce((sum, data) => sum + data.genderBias, 0) / clusterBiasData.length,
        ageBias: clusterBiasData.reduce((sum, data) => sum + data.ageBias, 0) / clusterBiasData.length,
        ethnicityBias: clusterBiasData.reduce((sum, data) => sum + data.ethnicityBias, 0) / clusterBiasData.length,
        recommendations: [
          "Select a specific cluster for detailed recommendations",
          "Overall, consider implementing fairness-aware training techniques",
          "Review your data collection and labeling processes for potential bias"
        ]
      };
    }
    
    // Make sure activeCluster is within bounds
    const clusterIndex = Math.min(Math.max(0, activeCluster), clusterBiasData.length - 1);
    return clusterBiasData[clusterIndex];
  };

  // Get bias data with fallback to default values if something goes wrong
  const biasData = (() => {
    try {
      return getBiasData() || {
        genderBias: 0,
        ageBias: 0,
        ethnicityBias: 0,
        recommendations: ["No data available"]
      };
    } catch (error) {
      console.error("Error getting bias data:", error);
      return {
        genderBias: 0,
        ageBias: 0,
        ethnicityBias: 0,
        recommendations: ["Error loading data"]
      };
    }
  })();

  return (
    <div className="min-h-screen bg-gray-50 p-6 pt-24">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">
            Embedding Space Analysis: {getClusterName(activeCluster)}
          </h2>
          <p className="text-gray-700 mb-4">
            This analysis examines the distribution of data points in the embedding space to identify potential biases.
            {activeCluster !== null && (
              <span className="font-medium"> Currently showing analysis for {getClusterName(activeCluster)}.</span>
            )}
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-medium mb-2">Cluster Distribution</h3>
              <div className="h-64 bg-gray-200 rounded flex items-center justify-center">
                [Placeholder for cluster distribution chart]
              </div>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-medium mb-2">Demographic Analysis</h3>
              <div className="h-64 bg-gray-200 rounded flex items-center justify-center">
                [Placeholder for demographic analysis chart]
              </div>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Bias Metrics</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-medium text-gray-900">Gender Bias Score</h3>
              <div className="text-3xl font-bold text-blue-600 mt-2">{biasData.genderBias.toFixed(2)}</div>
              <p className="text-sm text-gray-500 mt-1">Lower is better (0-1 scale)</p>
            </div>
            
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-medium text-gray-900">Age Bias Score</h3>
              <div className="text-3xl font-bold text-green-600 mt-2">{biasData.ageBias.toFixed(2)}</div>
              <p className="text-sm text-gray-500 mt-1">Lower is better (0-1 scale)</p>
            </div>
            
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-medium text-gray-900">Ethnicity Bias Score</h3>
              <div className="text-3xl font-bold text-orange-600 mt-2">{biasData.ethnicityBias.toFixed(2)}</div>
              <p className="text-sm text-gray-500 mt-1">Lower is better (0-1 scale)</p>
            </div>
          </div>
          
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-medium text-blue-800 mb-2">Recommendations</h3>
            <ul className="list-disc pl-5 text-blue-700 space-y-1">
              {biasData.recommendations.map((recommendation, index) => (
                <li key={index}>{recommendation}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
} 