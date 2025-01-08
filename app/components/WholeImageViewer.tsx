import React, { useEffect, useRef, useState } from 'react';

interface WholeImageViewerProps {
    imageUrl: string;
    coordinates?: string; // Bounding box coordinates: "xmin,ymin,xmax,ymax"
    onClose: () => void;
}

const WholeImageViewer: React.FC<WholeImageViewerProps> = ({
    imageUrl,
    coordinates,
    onClose,
}) => {
    const [showBoundingBox, setShowBoundingBox] = useState(false);
    const imageRef = useRef<HTMLImageElement | null>(null);
    const [scaledBox, setScaledBox] = useState({
        left: 0,
        top: 0,
        width: 0,
        height: 0,
    });

    const toggleBoundingBox = () => {
        setShowBoundingBox((prev) => !prev);
    };

    const calculateBoundingBox = () => {
        if (coordinates && imageRef.current) {
            const [xmin, ymin, xmax, ymax] = coordinates.split(',').map(Number);

            // Get natural dimensions of the image
            const naturalWidth = imageRef.current.naturalWidth;
            const naturalHeight = imageRef.current.naturalHeight;

            // Get rendered dimensions of the image
            const renderedWidth = imageRef.current.clientWidth;
            const renderedHeight = imageRef.current.clientHeight;

            // Calculate scaling ratios
            const scaleX = renderedWidth / naturalWidth;
            const scaleY = renderedHeight / naturalHeight;

            setScaledBox({
                left: xmin * scaleX,
                top: ymin * scaleY,
                width: (xmax - xmin) * scaleX,
                height: (ymax - ymin) * scaleY,
            });
        }
    };

    useEffect(() => {
        if (imageRef.current?.complete) {
            calculateBoundingBox();
        }
    }, [coordinates, imageUrl]);

    return (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-80 z-50 overflow-auto">
            {/* Modal Container */}
            <div className="relative flex items-center justify-center max-w-[90vw] max-h-[90vh] overflow-hidden rounded-lg shadow-2xl">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-white hover:text-gray-300 focus:outline-none transition-colors z-50"
                    aria-label="Close Modal"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        className="w-8 h-8"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                        />
                    </svg>
                </button>

                {/* Image Display */}
                <div className="relative flex items-center justify-center max-w-[80vw] max-h-[80vh] overflow-hidden">
                    <img
                        ref={imageRef}
                        src={imageUrl}
                        alt="Whole Image"
                        className="max-w-[80vw] max-h-[80vh] object-contain"
                        onLoad={calculateBoundingBox}
                    />

                    {/* Display the Bounding Box */}
                    {showBoundingBox && (
                        <div
                            style={{
                                position: 'absolute',
                                left: `${scaledBox.left}px`,
                                top: `${scaledBox.top}px`,
                                width: `${scaledBox.width}px`,
                                height: `${scaledBox.height}px`,
                                border: '2px solid red',
                                pointerEvents: 'none',
                            }}
                        ></div>
                    )}
                </div>

                {/* Toggle Bounding Box Button */}
                {coordinates && (
                    <div className="absolute bottom-4 flex justify-center w-full">
                        <button
                            onClick={toggleBoundingBox}
                            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md shadow-md hover:bg-blue-700 focus:outline-none transition-colors"
                        >
                            {showBoundingBox ? 'Hide Bounding Box' : 'Show Bounding Box'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WholeImageViewer;
