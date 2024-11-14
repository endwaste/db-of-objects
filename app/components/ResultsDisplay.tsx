import React from 'react';
import { QuestionMarkCircleIcon } from './Icons';

interface Result {
  score: number;
  metadata: {
    class: string;
    date_added: string;
    s3_file_name: string;
    s3_file_path: string;
    s3_presigned_url: string;
    file_type: 'image' | 'video' | 'text';
    start_offset_sec: number;
    end_offset_sec: number;
    interval_sec: number;
    segment: number;
  };
}

interface ResultsDisplayProps {
  isLoadingResults: boolean;
  results: Result[];
  getScoreLabel: (score: number) => { score: string };
  getVideoId: (result: Result, index: number) => string;
}

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({
  isLoadingResults,
  results,
  getScoreLabel,
  getVideoId,
}) => {
  return (
    <div>
      {isLoadingResults ? (
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(20)].map((_, index) => (
            <div key={index} className="animate-pulse">
              <div className="bg-gray-300 h-64 w-full rounded-sm"></div>
              <div className="h-4 bg-gray-300 rounded w-3/4 mt-2"></div>
            </div>
          ))}
        </div>
      ) : (
        results.length > 0 && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((result, index) => {
              const { score } = getScoreLabel(result.score);
              const videoId = getVideoId(result, index);
              return (
                <div key={videoId}>
                  {result.metadata.file_type === 'image' ? (
                    <img
                      src={result.metadata.s3_presigned_url}
                      alt="Result"
                      className="w-full h-auto object-cover mt-2 rounded hover-shadow"
                    />
                  ) : (
                    <div className="video-container mt-2 rounded hover-shadow">
                      <video id={videoId} className="video-js vjs-default">
                        <source src={result.metadata.s3_presigned_url} type="video/mp4" />
                        Your browser does not support the video tag.
                      </video>
                    </div>
                  )}
                  <div className="inline-block mt-2 mb-2 px-1 py-1 text-sm text-gray-400 flex items-center">
                    Similarity score: {score}.
                    <div className="relative ml-1 group">
                      <QuestionMarkCircleIcon className="h-4 w-4 text-gray-400" />
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-gray-500 text-white text-xs rounded py-1 px-2 hidden group-hover:block whitespace-nowrap">
                        Cosine similarity score between 0 - 1, higher is more similar.
                        <a href="https://www.pinecone.io/learn/vector-similarity?utm_source=shop-the-look&utm_medium=referral)" target="_blank" rel="noopener noreferrer" className="text-blue-300 hover:text-blue-200"> About vector similarity.</a>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
};

export default ResultsDisplay;
