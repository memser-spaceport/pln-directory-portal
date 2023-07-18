function ErrorBox(props) {
    const desc = props.desc;
    const onClose = props.onClose;

    const onCloseClicked = () => {
        if(onClose) {
            onClose()
        }
    }
    return <>
        <div className="eb">
            <div className="eb__header">
                <img src="/assets/images/icons/danger.svg" className="eb__header__img"/>
                <p className="eb__header__title">Something went wrong</p>
            </div>
            <div className="eb__body">
                <p>{desc}</p>
                <div className="eb__body__action">
                    <button onClick={onCloseClicked} className="eb__body__action__btn">Close</button>
                </div>
            </div>
        </div>
        <style jsx>
            {
                `
                .eb {background: white; z-index: 51; position: relative; width: 650px; border-radius: 8px; padding: 24px 32px; min-height: 150px; }
                .eb__header {display: flex; align-items: center;}
                .eb__header__img {width: 42px; height: 42px;}
                .eb__header__title {font-size: 26px; font-weight:700; margin-left: 18px;}

                .eb__body {display: flex; flex-direction: column; justify-content: center;padding: 16px 0;}
                .eb__body__desc {}
                .eb__body__action {display: flex; justify-content: flex-end;}
                .eb__body__action__btn {border: 1px solid #156FF7; color: #156FF7; margin-right: 8px; margin-top: 16px; font-size: 15px; font-weight: 600; padding: 8px 24px; box-shadow: 0px 1px 1px rgba(7, 8, 8, 0.16), inset 0px 1px 0px rgba(255, 255, 255, 0.16);border-radius: 100px;}
                `
            }
        </style>
    </>
}

export default ErrorBox