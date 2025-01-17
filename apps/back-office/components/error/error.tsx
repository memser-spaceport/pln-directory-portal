'use client';

const Error = () => {
  return (
    <>
      <div className="error-container">
        <div className="error-container__content">
          <div className="error-container__content__notfoundcontainer">
            <img
              loading="lazy"
              className="error-container__content__notfound-img"
              alt="error"
              src="/assets/icons/notfound.svg"
            />
          </div>
          <div className="error-container__content__message">
            <h2 className="error-container__content__message__title">Oh snap! Something went wrong!</h2>
          </div>
        </div>
      </div>

      <style jsx>
        {`
            .error-container {
                position: fixed;
                top: 0;
                width: 100vw;
                height: 100dvh;
                display: flex; 
                background: #F1F5F9;
                align-items:center;
                justify-content: center;
            }

            .error-container__content {
                display: flex;
                width: 320px;
                color: #fff;
                flex-direction: column;
                gap: 10px;
            }

            .error-container__content__message__title {
              color: #000;
            }

            .error-container__content__notfoundcontainer {
                height: 112px;
            }

            .error-container__content__notfound-img {
                
            }

            .error-container__content__message {
                display: flex;
                width: 320px;
                font-size: 14px;
                line-height: 20px;
                text-align: center;
                flex-direction: column;
                color: #000;
                gap: 16px;
            }

            .error-container__content__message__title {
                color: #0F172A;
                text-align: center;
                font-size: 26px;
                font-weight: 700;
                line-height: 32px;
            }

            @media(min-width: 1024px) {
            .error-container__content__message__title {
                font-size: 32px;
        }
            .`}
      </style>
    </>
  );
};

export default Error;
