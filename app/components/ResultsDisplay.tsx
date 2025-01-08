import { ChevronDownIcon, ChevronUpIcon, PencilIcon, TrashIcon } from "@heroicons/react/24/solid";
import axios from "axios";
import Image from "next/image";
import React, { useState } from "react";
import WholeImageViewer from "./WholeImageViewer";

interface Result {
  score: number;
  metadata: {
    class?: string;
    date_added?: string;
    s3_file_name?: string;
    s3_file_path?: string;
    s3_presigned_url: string;
    whole_image_presigned_url?: string;
    file_type: "image" | "video" | "text";
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
  apiUrl: string;
  isLoadingResults: boolean;
  results: Result[];
  getScoreLabel: (score: number) => { score: string };
  getVideoId: (result: Result, index: number) => string;
  onEdit?: (metadata: Record<string, any>) => void;
}

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({
  isLoadingResults,
  apiUrl,
  results,
  getScoreLabel,
  getVideoId,
  onEdit,
}) => {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedWholeImage, setSelectedWholeImage] = useState<string | null>(null);
  const [selectedCoordinates, setSelectedCoordinates] = useState<string | null>(null);
  const [showMore, setShowMore] = useState<Record<string, boolean>>({});

  const toggleShowMore = (id: string) => {
    setShowMore((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDelete = async (embeddingId: string) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this object?");
    if (!confirmDelete) return;

    try {
      await axios.post(`${apiUrl}/delete`, { embedding_id: embeddingId });
      setSuccessMessage("Object deleted successfully.");
      window.location.reload();
    } catch (error) {
      console.error("Failed to delete entry:", error);
      setSuccessMessage("Failed to delete object. Please try again.");
    }
  };

  const handleEdit = (metadata: Record<string, any>) => {
    if (onEdit) onEdit(metadata);
  };

  const openWholeImage = (imageUrl: string, coordinates?: string) => {
    setSelectedWholeImage(imageUrl);
    setSelectedCoordinates(coordinates || null);
  };

  const closeWholeImage = () => {
    setSelectedWholeImage(null);
    setSelectedCoordinates(null);
  };

  return (
    <div>
      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-500 text-white p-2 rounded mb-4">
          {successMessage}
        </div>
      )}

      {/* Loading State */}
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
              const roundedScore = parseFloat(score).toFixed(3); // Round to 3 decimal places
              const videoId = getVideoId(result, index);
              const metadataId = result.metadata.embedding_id || `${index}`;

              const prioritizedMetadata: Record<string, string | undefined> = {
                Color: result.metadata.color,
                Material: result.metadata.material,
                "Form Factor": result.metadata.shape,
                Brand: result.metadata.brand,
                Modifier: result.metadata.modifier,
              };

              const otherMetadata = Object.entries(result.metadata).filter(
                ([key, value]) =>
                  ![
                    "file_type",
                    "s3_presigned_url",
                    "s3_file_name",
                    "whole_image_presigned_url",
                    "color",
                    "material",
                    "shape",
                    "brand",
                    "modifier",
                  ].includes(key) && value
              );

              return (
                <div key={videoId} className="relative group rounded-md overflow-hidden">
                  {/* Action Buttons */}
                  <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <button onClick={() => handleEdit(result.metadata)} className="text-blue-500 hover:text-blue-700">
                      <PencilIcon className="w-5 h-5" />
                    </button>
                    <button onClick={() => handleDelete(result.metadata.embedding_id || "")} className="text-red-500 hover:text-red-700">
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Display Image */}
                  <div className="relative">
                    <Image
                      src={result.metadata.s3_presigned_url}
                      alt="Result"
                      className="w-full h-auto object-cover rounded"
                      width="640"
                      height="360"
                    />
                    {/* Similarity Score */}
                    <div className="absolute bottom-2 right-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded-md shadow-md">
                      {roundedScore}
                    </div>
                    {/* View Whole Image Button */}
                    {result.metadata.whole_image_presigned_url && (
                      <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <button
                          onClick={() => openWholeImage(result.metadata.whole_image_presigned_url, result.metadata.coordinates)}
                          className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md shadow-md hover:bg-blue-700 focus:outline-none"
                        >
                          View Whole Image
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Metadata */}
                  <div className="mt-4 p-4 bg-white shadow-md rounded-md text-gray-800 text-xs">
                    {Object.entries(prioritizedMetadata).map(([key, value]) =>
                      value ? (
                        <p key={key} className="mb-2">
                          <strong>{key}:</strong> {value}
                        </p>
                      ) : null
                    )}

                    {showMore[metadataId] &&
                      otherMetadata.map(([key, value]) => (
                        <p key={key} className="mb-2">
                          <strong>{key}:</strong> {value}
                        </p>
                      ))}

                    <button onClick={() => toggleShowMore(metadataId)} className="mt-4 text-blue-500 hover:text-blue-700 flex items-center">
                      {showMore[metadataId] ? <>Show Less <ChevronUpIcon className="w-4 h-4 ml-1" /></> : <>Show More <ChevronDownIcon className="w-4 h-4 ml-1" /></>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {selectedWholeImage && <WholeImageViewer imageUrl={selectedWholeImage} coordinates={selectedCoordinates} onClose={closeWholeImage} />}
    </div>
  );
};

export default ResultsDisplay;
