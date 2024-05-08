'use client';

export default function IrlHeader() {
  return (
    <>
      <div className="irlHdr">
        <div className="irlHdr__title">
          IRL Gatherings
        </div>
        {/* <div className="irlHdr__button">
          <div className="irlHdr__button__manage">
            <button type="button" className="irlHdr__button__manage__btn">
              <img src="/assets/images/icons/gear.svg" alt="Gear" />
              <span>Manage</span>
            </button>
          </div>
          <div className="irlHdr__button__add">
            <button type="button" className="irlHdr__button__add__btn">
              Add a Conference
            </button>
          </div>
        </div> */}
      </div>
      <style jsx>
        {`
          .irlHdr {
            width: 100%;
            height: 100%;
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: center
          }

          .irlHdr__title{
            font-weight: 700;
            font-size: 18px;
            line-height: 20px;
            color: #0F172A;
          }
          
          .irlHdr__button {
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .irlHdr__button__manage__btn {
            display: flex;
            align-items: center;
            gap: 2px;
            padding: 10px 24px;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            background-color: #ffffff;
            outline: none;
          }

          .irlHdr__button__manage__btn:hover {
            border: 1px solid #94a3b8;
          }

          .irlHdr__button__manage__btn img {
            height: 16px;
            width: 16px;
          }

          .irlHdr__button__manage__btn span {
            font-weight: 500;
            font-size: 14px;
            line-height: 20px;
            color: #0f172a;
          }

          .irlHdr__button__add__btn {
            padding: 10px 24px;
            background-color: #156ff7;
            color: #ffffff;
            font-weight: 500;
            font-size: 14px;
            line-height: 20px;
            border-radius: 8px;
            box-shadow: 0px 1px 1px 0px #0f172a14;
          }

          .irlHdr__button__add__btn:hover {
            background-color: #1d4ed8;
          }

          @media (min-width: 1024px) {
            .irlHdr__title{
              font-size: 28px;
              line-height: 40px;
            }
          }
        `}
      </style>
    </>
  );
}
