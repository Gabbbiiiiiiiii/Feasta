export type CustomerReviewRating = 1 | 2 | 3 | 4 | 5;

export type SubmitCustomerReviewInput = {
  providerRequestId: string;
  rating: CustomerReviewRating;
  comment: string;
};

export type SubmitCustomerReviewResult = {
  created: boolean;
};
