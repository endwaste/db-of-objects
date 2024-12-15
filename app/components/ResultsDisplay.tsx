import Image from "next/image";
import React from 'react';

interface Result {
  score: number;
  metadata: {
    class?: string;
    date_added?: string;
    s3_file_name?: string;
    s3_file_path?: string;
    s3_presigned_url: string;
    file_type: 'image' | 'video' | 'text';
    start_offset_sec?: number;
    end_offset_sec?: number;
    interval_sec?: number;
    segment?: number;
    brand?: string;
    modifier?: string;
    color?: string;
    coordinates?: string;
    datetime_taken?: string;
    embedding_id?: string;
    material?: string;
    original_s3_uri?: string;
    robot?: string;
    shape?: string;
    comment?: string;
    timestamp?: string;
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
                    <Image
                      src={result.metadata.s3_presigned_url}
                      alt="Result"
                      className="w-full h-auto object-cover mt-2 rounded"
                      width="640"
                      height="360"
                    />
                  ) : (
                    <div className="video-container mt-2 rounded">
                      <video id={videoId} className="video-js vjs-default">
                        <source src={result.metadata.s3_presigned_url} type="video/mp4" />
                        Your browser does not support the video tag.
                      </video>
                    </div>
                  )}

                  {/* Metadata Box with Similarity Score */}
                  <div className="mt-1 p-2 bg-gray-100 text-gray-800 text-xs rounded shadow break-words">
                    {Object.entries(result.metadata).map(([key, value]) => {
                      if (value && key !== 'file_type' && key !== 's3_presigned_url' && key !== 's3_file_name') {
                        return (
                          <p key={key}>
                            <strong>{key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())}:</strong> {value}
                          </p>
                        );
                      }
                      return null;
                    })}
                    <p>
                      <strong>Similarity Score:</strong> {score}
                    </p>
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
