import React, {useState} from 'react'
import MaFileInterface from '../../../electron/interfaces/SteamAccount/MaFileInterface';
import SmaFileInterface from '../../../electron/interfaces/SteamAccount/SmaFileInterface';
import Delimeter from '../Delimeter/Delimeter';
import Icon from '../Icon/Icon';
import './MaFile.css'

function MaFile(props: MaFileListInterface) {
    
  const [isSessionOpen, setIsSessionOpen] = useState(false);
  const {maFile} = props;

  return (
    <div className="imported-steam-account-mafile-list__container">
    <ul className="imported-steam-account-mafile-list">
      {Object.keys(maFile).map((field, index) => {
        return field != "Session" ? (
          <li key={index} className="maFile-item">
            <div className="maFile-item-data">
              <span>{field}</span>
              <span className="maFile-item-field-value">
                {JSON.stringify(Object.values(maFile)[index])}
              </span>
            </div>
            <Delimeter
              color="var(--sda-border)"
              marginBottom="8px"
              marginTop="8px"
            ></Delimeter>
          </li>
        ) : (
          <li key={index} className="maFile-item">
            <div className="maFile-item-data">
              <span>{field}</span>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-start",
                  width: "100%",
                  marginLeft: "10px",
                  cursor: "pointer",
                }}
                
                onClick={() => {
                  setIsSessionOpen(!isSessionOpen);
                }}
              >
                <Icon name={isSessionOpen ? "chevronUp" : "chevronDown"} />
              </div>
            </div>
            <Delimeter
              color="var(--sda-border)"
              marginBottom="8px"
              marginTop="8px"
            ></Delimeter>
          </li>
        );
      })}

      {isSessionOpen ? Object.keys(maFile.Session).map((field, index)=>{
        return(
          <li key={index} className="maFile-item" >
          <div className="maFile-item-data">
            <span style={{paddingLeft: "30px", paddingRight: "30px"}}>{field}</span>
            <span className="maFile-item-field-value">
              {Object.values(maFile.Session)[index]}
            </span>
          </div>
          <Delimeter
            color="var(--sda-border)"
            marginBottom="8px"
            marginTop="8px"
          ></Delimeter>
        </li>
        )
      }) : <></>}
    </ul>
  </div>
  )
}

interface MaFileListInterface {
    maFile: MaFileInterface
}

export default MaFile